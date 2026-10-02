import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, User } from "@prisma/client";
import { z } from "zod";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { requireTicketAccess, staffAssignedCondoIds } from "@/lib/auth/ticket-access";
import { DOCUMENT_KIND_VALUES, type DocumentKindValue } from "@/lib/documents/kinds";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { isMarkdownFile } from "@/lib/storage/provider";
import { noopDocumentIndex } from "@/lib/search/document-index-port";
import { officeDocumentRagEligible } from "@/lib/ai/rag-eligibility";
import { dispatchToWhatsApp } from "@/lib/services/whatsapp-dispatch";
import { writeAudit } from "@/lib/services/audit-service";
import { mustRejectScan, scanBuffer } from "@/lib/security/clamav-scan";

export const documentFichaSchema = z.object({
  kind: z.enum(DOCUMENT_KIND_VALUES),
  title: z.string().trim().min(2).max(160),
  purpose: z.string().trim().min(10).max(2000),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  condominiumId: z.string().uuid(),
});

export type DocumentFichaInput = z.infer<typeof documentFichaSchema>;

function isUtf8Text(buffer: Buffer) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return !text.includes("\u0000");
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveDocumentTicketId(
  user: User,
  db: PrismaClient,
  condominiumId: string,
  ticketId: string | undefined,
) {
  const raw = ticketId?.trim();
  if (!raw || !UUID_RE.test(raw)) return null;
  const ticket = await requireTicketAccess(user, raw, db);
  if (ticket.condominiumId !== condominiumId) {
    throw unprocessable("Chamado de outro condomínio");
  }
  return ticket.id;
}

export function createDocumentService(db: PrismaClient = defaultPrisma) {
  return {
    async list(user: User, page: number, pageSize: number, condominiumId?: string) {
      const where: Prisma.OfficeDocumentWhereInput = {};
      if (condominiumId) where.condominiumId = condominiumId;
      if (!isAdmin(user)) {
        const condoIds = await staffAssignedCondoIds(user.id, db);
        if (condoIds.length === 0) return { items: [], total: 0, page, pageSize };
        where.condominiumId = condominiumId
          ? condominiumId
          : { in: condoIds };
        if (condominiumId && !condoIds.includes(condominiumId)) {
          throw forbidden("Sem permissão para este condomínio");
        }
      }
      const [total, items] = await Promise.all([
        db.officeDocument.count({ where }),
        db.officeDocument.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            condominium: { select: { id: true, nome: true } },
            uploadedBy: { select: { id: true, email: true } },
          },
        }),
      ]);
      return { items, total, page, pageSize };
    },

    async summaryByCondominium(user: User) {
      if (isAdmin(user)) {
        const [condos, groups] = await Promise.all([
          db.condominium.findMany({
            where: { deletedAt: null },
            select: { id: true, nome: true },
            orderBy: { nome: "asc" },
          }),
          db.officeDocument.groupBy({
            by: ["condominiumId"],
            _count: { _all: true },
            _sum: { sizeBytes: true },
            _max: { createdAt: true },
          }),
        ]);
        const stats = new Map(groups.map((g) => [g.condominiumId, g]));
        return condos.map((c) => {
          const g = stats.get(c.id);
          return {
            condominiumId: c.id,
            nome: c.nome,
            count: g?._count._all ?? 0,
            sizeBytes: g?._sum.sizeBytes ?? 0,
            lastAt: g?._max.createdAt ?? null,
          };
        });
      }

      const condoIds = await staffAssignedCondoIds(user.id, db);
      if (condoIds.length === 0) return [];
      const [condos, groups] = await Promise.all([
        db.condominium.findMany({
          where: { id: { in: condoIds }, deletedAt: null },
          select: { id: true, nome: true },
          orderBy: { nome: "asc" },
        }),
        db.officeDocument.groupBy({
          by: ["condominiumId"],
          where: { condominiumId: { in: condoIds } },
          _count: { _all: true },
          _sum: { sizeBytes: true },
          _max: { createdAt: true },
        }),
      ]);
      const stats = new Map(groups.map((g) => [g.condominiumId, g]));
      return condos.map((c) => {
        const g = stats.get(c.id);
        return {
          condominiumId: c.id,
          nome: c.nome,
          count: g?._count._all ?? 0,
          sizeBytes: g?._sum.sizeBytes ?? 0,
          lastAt: g?._max.createdAt ?? null,
        };
      });
    },

    async upload(
      user: User,
      input: {
        kind: DocumentKindValue;
        title: string;
        purpose: string;
        notes?: string;
        condominiumId?: string;
        ticketId?: string;
        file: { buffer: Buffer; name: string; mime: string };
      },
    ) {
      if (!input.condominiumId) throw unprocessable("Informe o condomínio");
      const ficha = documentFichaSchema.parse({
        kind: input.kind,
        title: input.title,
        purpose: input.purpose,
        notes: input.notes,
        condominiumId: input.condominiumId,
      });

      if (!isAdmin(user)) {
        const condoIds = await staffAssignedCondoIds(user.id, db);
        if (!condoIds.includes(ficha.condominiumId)) {
          throw forbidden("Funcionário só anexa documento em condomínio com chamado atribuído");
        }
      }
      const condo = await db.condominium.findFirst({ where: { id: ficha.condominiumId, deletedAt: null } });
      if (!condo) throw notFound("Condomínio não encontrado");
      const ticketId = await resolveDocumentTicketId(user, db, condo.id, input.ticketId);

      const scan = await scanBuffer(input.file.buffer);
      if (mustRejectScan(scan)) {
        throw unprocessable(scan === "infected" ? "Arquivo recusado pelo antivírus" : "Falha ao verificar o arquivo");
      }

      const markdown = isMarkdownFile(input.file.name, input.file.mime);
      if (markdown && !isUtf8Text(input.file.buffer)) {
        throw unprocessable("Arquivo .md precisa ser texto UTF-8");
      }
      const stored = await localDiskStorage.save(
        input.file.buffer,
        input.file.name,
        markdown ? "text/markdown" : input.file.mime,
        { officeDocument: true },
      );
      const sha256 = createHash("sha256").update(input.file.buffer).digest("hex");
      const ragEnabled = officeDocumentRagEligible({
        ragEnabled: true,
        effectiveFrom: null,
        effectiveUntil: null,
        mime: stored.mime,
        kind: ficha.kind,
      });
      const doc = await db.officeDocument.create({
        data: {
          condominiumId: condo.id,
          ticketId,
          uploadedById: user.id,
          kind: ficha.kind,
          title: ficha.title,
          purpose: ficha.purpose,
          notes: ficha.notes || null,
          storageKey: stored.storageKey,
          mime: stored.mime,
          sizeBytes: stored.sizeBytes,
          originalName: stored.originalName,
          sha256,
          ingestStatus: "stored",
          ragEnabled,
        },
      });
      await noopDocumentIndex.enqueue({ documentId: doc.id, storageKey: doc.storageKey });
      await writeAudit(db, {
        actorId: user.id,
        action: "document.create",
        entityType: "document",
        entityId: doc.id,
        after: {
          id: doc.id,
          condominiumId: doc.condominiumId,
          ticketId: doc.ticketId,
          kind: doc.kind,
          title: doc.title,
          purpose: doc.purpose,
          originalName: doc.originalName,
          mime: doc.mime,
          sizeBytes: doc.sizeBytes,
        },
      });
      return doc;
    },

    async patchClientSendable(user: User, documentId: string, clientSendable: boolean) {
      const doc = await db.officeDocument.findFirst({ where: { id: documentId } });
      if (!doc) throw notFound("Documento não encontrado");
      if (doc.ticketId) {
        await requireTicketAccess(user, doc.ticketId, db);
      } else if (!isAdmin(user)) {
        const condoIds = await staffAssignedCondoIds(user.id, db);
        if (!condoIds.includes(doc.condominiumId)) {
          throw forbidden("Sem permissão para este documento");
        }
      }
      const updated = await db.officeDocument.update({
        where: { id: doc.id },
        data: { clientSendable },
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "document.patch",
        entityType: "document",
        entityId: doc.id,
        before: { clientSendable: doc.clientSendable },
        after: { clientSendable: updated.clientSendable },
      });
      return updated;
    },

    async patchTicketId(user: User, documentId: string, ticketId: string) {
      const doc = await db.officeDocument.findFirst({ where: { id: documentId } });
      if (!doc) throw notFound("Documento não encontrado");
      if (!isAdmin(user)) {
        const condoIds = await staffAssignedCondoIds(user.id, db);
        if (!condoIds.includes(doc.condominiumId)) {
          throw forbidden("Sem permissão para este documento");
        }
      }
      const linked = await resolveDocumentTicketId(user, db, doc.condominiumId, ticketId);
      if (!linked) throw unprocessable("Informe um chamado válido");
      const updated = await db.officeDocument.update({
        where: { id: doc.id },
        data: { ticketId: linked },
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "document.patch",
        entityType: "document",
        entityId: doc.id,
        before: { ticketId: doc.ticketId },
        after: { ticketId: updated.ticketId },
      });
      return updated;
    },

    async patchRagEnabled(user: User, documentId: string, ragEnabled: boolean) {
      if (!isAdmin(user)) throw forbidden("Somente administradores ligam a busca da IA");
      const doc = await db.officeDocument.findFirst({ where: { id: documentId } });
      if (!doc) throw notFound("Documento não encontrado");
      if (ragEnabled && !officeDocumentRagEligible({ ...doc, ragEnabled: true })) {
        throw unprocessable("Áudio e documento fora da vigência não entram na busca");
      }
      const updated = await db.officeDocument.update({
        where: { id: doc.id },
        data: { ragEnabled },
      });
      if (!ragEnabled) {
        await db.documentChunk.updateMany({
          where: { officeDocumentId: doc.id },
          data: { active: false },
        });
        if (updated.ingestStatus === "pending_index" || updated.ingestStatus === "indexed") {
          await db.officeDocument.update({
            where: { id: doc.id },
            data: { ingestStatus: "stored" },
          });
        }
      } else {
        await noopDocumentIndex.enqueue({ documentId: doc.id, storageKey: doc.storageKey });
        await db.aiJob.updateMany({
          where: {
            type: "ai.document.ingest",
            idempotencyKey: `document:${doc.id}:rev:${doc.contentRevision}`,
          },
          data: { status: "queued", lockedAt: null, lastErrorCode: null, runAfter: new Date() },
        });
      }
      await writeAudit(db, {
        actorId: user.id,
        action: "document.rag",
        entityType: "document",
        entityId: doc.id,
        before: { ragEnabled: doc.ragEnabled },
        after: { ragEnabled },
      });
      return db.officeDocument.findFirstOrThrow({ where: { id: doc.id } });
    },

    async queueWhatsAppDraft(user: User, documentId: string) {
      const doc = await db.officeDocument.findFirst({
        where: { id: documentId },
        include: { ticket: { include: { conversation: { include: { contact: true } } } } },
      });
      if (!doc) throw notFound("Documento não encontrado");
      if (!doc.clientSendable) throw unprocessable("Marque para permitir envio ao cliente");
      if (!doc.ticketId) throw unprocessable("Vincule o documento a um chamado para enviar");
      await requireTicketAccess(user, doc.ticketId, db);
      const conversationId = doc.ticket?.conversationId;
      if (!conversationId) throw unprocessable("Chamado sem conversa para enviar no WhatsApp");
      if (!doc.ticket?.conversation?.contact?.phoneE164) {
        throw unprocessable("Identifique o contato antes de enviar");
      }
      const message = await db.message.create({
        data: {
          conversationId,
          ticketId: doc.ticketId,
          direction: "out",
          visibility: "publica",
          sendStatus: "pending",
          body: doc.title || doc.originalName,
          attachments: {
            create: {
              storageKey: doc.storageKey,
              mime: doc.mime,
              sizeBytes: doc.sizeBytes,
              originalName: doc.originalName,
            },
          },
        },
        include: { attachments: true },
      });
      const sent = await dispatchToWhatsApp(db, user, message.id);
      return { message: sent, sentToWhatsApp: sent.sendStatus === "sent" };
    },

    async reindex(user: User, documentId: string) {
      const doc = await db.officeDocument.findFirst({ where: { id: documentId } });
      if (!doc) throw notFound("Documento não encontrado");
      if (doc.ticketId) {
        await requireTicketAccess(user, doc.ticketId, db);
      } else if (!isAdmin(user)) {
        const condoIds = await staffAssignedCondoIds(user.id, db);
        if (!condoIds.includes(doc.condominiumId)) {
          throw forbidden("Sem permissão para este documento");
        }
      }
      await db.officeDocument.update({
        where: { id: doc.id },
        data: { ingestStatus: "stored" },
      });
      await noopDocumentIndex.enqueue({ documentId: doc.id, storageKey: doc.storageKey });
      await db.aiJob.updateMany({
        where: {
          type: "ai.document.ingest",
          idempotencyKey: `document:${doc.id}:rev:${doc.contentRevision}`,
        },
        data: { status: "queued", lockedAt: null, lastErrorCode: null, runAfter: new Date() },
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "document.reindex",
        entityType: "document",
        entityId: doc.id,
        after: { ingestStatus: "pending_index" },
      });
      return db.officeDocument.findFirstOrThrow({ where: { id: doc.id } });
    },

    async authorizeRead(user: User, storageKey: string) {
      const doc = await db.officeDocument.findFirst({
        where: { storageKey },
      });
      if (doc) {
        if (isAdmin(user)) return doc;
        const condoIds = await staffAssignedCondoIds(user.id, db);
        if (!condoIds.includes(doc.condominiumId)) {
          throw forbidden("Sem permissão para este arquivo");
        }
        return doc;
      }
      const att = await db.messageAttachment.findFirst({
        where: { storageKey },
        include: {
          message: { include: { conversation: { include: { tickets: { select: { assignedToId: true } } } } } },
        },
      });
      if (!att) throw notFound("Arquivo não encontrado");
      if (!isAdmin(user)) {
        const mine = att.message.conversation.tickets.some((t) => t.assignedToId === user.id);
        if (!mine) throw forbidden("Sem permissão para este arquivo");
      }
      return { storageKey: att.storageKey, mime: att.mime, originalName: att.originalName };
    },
  };
}

export const documentCreateQuery = z.object({
  condominiumId: z.string().uuid().optional(),
});

export const documentService = createDocumentService();
