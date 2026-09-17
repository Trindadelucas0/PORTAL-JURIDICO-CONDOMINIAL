import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, User } from "@prisma/client";
import { z } from "zod";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { requireTicketAccess } from "@/lib/auth/ticket-access";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { noopDocumentIndex } from "@/lib/search/document-index-port";
import { dispatchToWhatsApp } from "@/lib/services/whatsapp-dispatch";

export function createDocumentService(db: PrismaClient = defaultPrisma) {
  return {
    async list(user: User, page: number, pageSize: number, condominiumId?: string, ticketId?: string) {
      const where: Prisma.OfficeDocumentWhereInput = {};
      if (condominiumId) where.condominiumId = condominiumId;
      if (ticketId) where.ticketId = ticketId;
      if (!isAdmin(user)) {
        where.ticket = { assignedToId: user.id };
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
            ticket: { select: { id: true, protocol: true, assignedToId: true } },
            uploadedBy: { select: { id: true, email: true } },
          },
        }),
      ]);
      return { items, total, page, pageSize };
    },

    async upload(
      user: User,
      input: {
        condominiumId?: string;
        ticketId?: string;
        file: { buffer: Buffer; name: string; mime: string };
      },
    ) {
      let condominiumId = input.condominiumId;
      if (input.ticketId) {
        const ticket = await requireTicketAccess(user, input.ticketId, db);
        condominiumId = ticket.condominiumId;
      } else if (!isAdmin(user)) {
        throw forbidden("Funcionário só anexa documento em chamado atribuído");
      }
      if (!condominiumId) throw unprocessable("Informe condomínio ou chamado");
      const condo = await db.condominium.findFirst({ where: { id: condominiumId, deletedAt: null } });
      if (!condo) throw notFound("Condomínio não encontrado");

      const stored = await localDiskStorage.save(input.file.buffer, input.file.name, input.file.mime);
      const sha256 = createHash("sha256").update(input.file.buffer).digest("hex");
      const doc = await db.officeDocument.create({
        data: {
          condominiumId: condo.id,
          ticketId: input.ticketId || null,
          uploadedById: user.id,
          storageKey: stored.storageKey,
          mime: stored.mime,
          sizeBytes: stored.sizeBytes,
          originalName: stored.originalName,
          sha256,
          ingestStatus: "stored",
        },
      });
      await noopDocumentIndex.enqueue({ documentId: doc.id, storageKey: doc.storageKey });
      return doc;
    },

    async queueWhatsAppDraft(user: User, documentId: string) {
      const doc = await db.officeDocument.findFirst({
        where: { id: documentId },
        include: { ticket: { include: { conversation: { include: { contact: true } } } } },
      });
      if (!doc) throw notFound("Documento não encontrado");
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
          body: doc.originalName,
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

    async authorizeRead(user: User, storageKey: string) {
      const doc = await db.officeDocument.findFirst({
        where: { storageKey },
        include: { ticket: { select: { assignedToId: true } } },
      });
      if (doc) {
        if (isAdmin(user)) return doc;
        if (!doc.ticket || doc.ticket.assignedToId !== user.id) {
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
  ticketId: z.string().uuid().optional(),
});

export const documentService = createDocumentService();
