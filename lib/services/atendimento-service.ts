import type { ChannelType, Conversation, Prisma, PrismaClient, User } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { normalizeE164 } from "@/lib/phone/e164";
import { e164LookupValues, isLidPeer, uniquePhones } from "@/lib/phone/identity";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { providerFor } from "@/lib/channels/resolve-provider";
import { writeAudit } from "@/lib/services/audit-service";
import { canSendPublicWhatsApp, dispatchToWhatsApp } from "@/lib/services/whatsapp-dispatch";
import { findContactByPhones, upsertContactIdentities } from "@/lib/services/contact-identity";
import { mergeConversations } from "@/lib/services/conversation-merge";
import { interpretEvolutionMessageRows } from "@/lib/channels/evolution-webhook";
import { fetchEvolutionMessages } from "@/lib/channels/evolution-lid-map";
import {
  inFlowConversationWhere,
  isInOperationalFlow,
  outOfFlowConversationWhere,
  sendableWhatsAppE164,
} from "@/lib/services/operational-flow";
import {
  peerAvatarPublicUrl,
  schedulePeerProfileEnrichment,
} from "@/lib/services/peer-avatar-service";
import { messageWindow } from "@/lib/api/pagination";
import { enqueueInboundJob, enqueueMediaDownloadJob } from "@/lib/ai/enqueue";
import { SELECTED_MESSAGE_LIMIT } from "@/lib/ai/package";
import { processInbound } from "@/lib/services/automation-service";
import { createTicketService } from "@/lib/services/ticket-service";

export type InboundPayload = {
  waMessageId: string;
  fromPhone: string;
  waLid?: string | null;
  body: string;
  peerDisplayName?: string | null;
  connectionId?: string;
  connectionType?: ChannelType;
  mediaHint?: { mimetype?: string; fileName?: string } | null;
};

export type OwnOutboundPayload = {
  waMessageId: string;
  fromPhone?: string;
  waLid?: string | null;
  body?: string;
  sentAt?: string | Date | null;
  connectionId?: string;
  connectionType?: ChannelType;
};

export type IngestResult = {
  created: boolean;
  conversationId: string;
  messageId: string;
  unidentified: boolean;
  triageId: string | null;
  ticketCreated: boolean;
};

function sanitizePeerDisplayName(value?: string | null): string | null {
  const text = value?.trim().replace(/\s+/g, " ");
  if (!text || text.length < 2 || text.length > 80) return null;
  if (/^\+?\d[\d\s()-]{6,}$/.test(text)) return null;
  return text;
}

function latestOfficeReadAt(reads: { lastReadAt: Date }[]): Date | null {
  if (!reads.length) return null;
  return reads.reduce((max, row) => (row.lastReadAt > max ? row.lastReadAt : max), reads[0].lastReadAt);
}

async function unopenedInboundCounts(
  db: PrismaClient,
  conversationIds: string[],
  cutoffById: Map<string, Date | null>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(conversationIds.map((id) => [id, 0]));
  if (conversationIds.length === 0) return counts;
  const or: Prisma.MessageWhereInput[] = conversationIds.map((id) => {
    const cutoff = cutoffById.get(id);
    return cutoff
      ? { conversationId: id, createdAt: { gt: cutoff } }
      : { conversationId: id };
  });
  const grouped = await db.message.groupBy({
    by: ["conversationId"],
    where: { direction: "in", OR: or },
    _count: { _all: true },
  });
  for (const row of grouped) {
    counts.set(row.conversationId, row._count._all);
  }
  return counts;
}

async function promoteLidPeerToPhone(
  db: PrismaClient,
  conversation: Conversation,
  phone: string,
): Promise<Conversation> {
  if (!isLidPeer(conversation.peerPhoneE164) || isLidPeer(phone)) return conversation;
  const peerLid = conversation.peerLid || conversation.peerPhoneE164;
  try {
    return await db.conversation.update({
      where: { id: conversation.id },
      data: { peerPhoneE164: phone, peerLid },
    });
  } catch (error) {
    if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
      const other = await db.conversation.findFirst({
        where: { connectionId: conversation.connectionId, peerPhoneE164: phone },
      });
      if (other && other.id !== conversation.id) {
        if (peerLid && !other.peerLid) {
          await db.conversation.update({ where: { id: other.id }, data: { peerLid } });
        }
        await mergeConversations(db, other.id, conversation.id);
        return (await db.conversation.findFirst({ where: { id: other.id } })) ?? other;
      }
    } else {
      throw error;
    }
  }
  return conversation;
}

async function promoteLidContactToPhone(
  db: PrismaClient,
  contact: { id: string; phoneE164: string },
  realPhone: string,
  extraKeys: Array<string | null | undefined>,
) {
  const current = await db.contact.findFirst({ where: { id: contact.id, deletedAt: null } });
  if (!current) return null;
  if (!isLidPeer(current.phoneE164) || isLidPeer(realPhone)) {
    return current;
  }
  const taken = await db.contact.findFirst({
    where: { phoneE164: realPhone, id: { not: current.id }, deletedAt: null },
  });
  if (taken) {
    await upsertContactIdentities(db, taken.id, uniquePhones(realPhone, current.phoneE164, ...extraKeys));
    return taken;
  }
  try {
    const updated = await db.contact.update({
      where: { id: current.id },
      data: { phoneE164: realPhone },
    });
    await upsertContactIdentities(
      db,
      updated.id,
      uniquePhones(realPhone, current.phoneE164, ...extraKeys),
    );
    return updated;
  } catch (error) {
    if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
      const rival = await db.contact.findFirst({
        where: { phoneE164: realPhone, id: { not: current.id }, deletedAt: null },
      });
      if (rival) {
        await upsertContactIdentities(db, rival.id, uniquePhones(realPhone, current.phoneE164, ...extraKeys));
        return rival;
      }
    }
    throw error;
  }
}

const OWN_SYNC_COOLDOWN_MS = 120_000; // 2 minutos
const OWN_SYNC_LIMIT = 50;
const ownSyncCooldown = new Map<string, number>();

function peerToRemoteJid(peerPhoneE164: string): string | null {
  if (isLidPeer(peerPhoneE164)) return null;
  const digits = peerPhoneE164.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits}@s.whatsapp.net`;
}

export function inboundPeerEnrichOptions(
  peerPhoneE164: string,
  peerAvatarKey: string | null,
  waMessageId: string,
) {
  return {
    waMessageId,
    forceAvatar: !peerAvatarKey,
    ...(isLidPeer(peerPhoneE164) ? { deep: true as const } : {}),
  };
}

async function withLiveBaileysStatus<T extends { type: string; status: string } | null>(row: T): Promise<T> {
  if (!row || row.type !== "evolution_baileys") return row;
  const provider = providerFor("evolution_baileys");
  if (!provider.isConfigured()) return { ...row, status: "close" };
  try {
    const live = await provider.getStatus();
    return live.status ? { ...row, status: live.status } : row;
  } catch {
    return row;
  }
}

export function createAtendimentoService(db: PrismaClient = defaultPrisma) {
  const tickets = createTicketService(db);
  return {
    async ingestInbound(payload: InboundPayload): Promise<IngestResult> {
      const existing = await db.message.findUnique({
        where: { waMessageId: payload.waMessageId },
        include: { conversation: { include: { triageItem: true } } },
      });
      if (existing) {
        return {
          created: false,
          conversationId: existing.conversationId,
          messageId: existing.id,
          unidentified: existing.conversation.unidentified,
          triageId: existing.conversation.triageItem?.id ?? null,
          ticketCreated: false,
        };
      }

      const phone = normalizeE164(payload.fromPhone);
      if (!phone) throw unprocessable("Telefone inbound inválido");
      const waLid = payload.waLid || (isLidPeer(phone) ? phone : null);
      const lookupKeys = uniquePhones(phone, waLid, ...e164LookupValues(phone));

      const connection = payload.connectionId
        ? await db.channelConnection.findFirst({ where: { id: payload.connectionId } })
        : await db.channelConnection.findFirst({
            where: { type: payload.connectionType ?? "dev_mock" },
            orderBy: { createdAt: "asc" },
          });
      if (!connection) throw unprocessable("Nenhuma conexão disponível para ingestão");

      let contact = await findContactByPhones(db, lookupKeys);
      const lidValue = (waLid && isLidPeer(waLid) ? waLid : null) || (isLidPeer(phone) ? phone : null);
      const or: Prisma.ConversationWhereInput[] = [
        { peerPhoneE164: { in: lookupKeys } },
        { peerLid: { in: lookupKeys } },
      ];
      if (contact) or.push({ contactId: contact.id });
      const matches = await db.conversation.findMany({
        where: { connectionId: connection.id, OR: or },
        orderBy: [{ unidentified: "asc" }, { createdAt: "asc" }],
      });

      let conversation: Conversation | null = matches[0] ?? null;
      for (const extra of matches.slice(1)) {
        if (conversation && extra.id !== conversation.id) {
          await mergeConversations(db, conversation.id, extra.id);
        }
      }
      if (matches.length > 1 && conversation) {
        conversation = await db.conversation.findFirst({ where: { id: conversation.id } });
      }

      const peerDisplayName = sanitizePeerDisplayName(payload.peerDisplayName);
      const peerKey = conversation?.peerPhoneE164 || phone;
      if (!conversation) {
        try {
          conversation = await db.conversation.create({
            data: {
              connectionId: connection.id,
              contactId: contact?.id ?? null,
              condominiumId: contact?.condominiumId ?? null,
              unidentified: !contact,
              peerPhoneE164: peerKey,
              peerLid: lidValue,
              peerDisplayName,
            },
          });
        } catch (error) {
          if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
            conversation = await db.conversation.findFirst({
              where: { connectionId: connection.id, peerPhoneE164: peerKey },
            });
          } else {
            throw error;
          }
        }
      }
      if (!conversation) throw unprocessable("Não foi possível abrir a conversa");

      const peerPatch: Prisma.ConversationUpdateInput = {};
      if (peerDisplayName && conversation.peerDisplayName !== peerDisplayName) {
        peerPatch.peerDisplayName = peerDisplayName;
      }
      if (lidValue && !conversation.peerLid) {
        peerPatch.peerLid = lidValue;
      }
      if (Object.keys(peerPatch).length > 0) {
        conversation = await db.conversation.update({
          where: { id: conversation.id },
          data: peerPatch,
        });
      }

      const realPhone = !isLidPeer(phone) ? phone : contact && !isLidPeer(contact.phoneE164) ? contact.phoneE164 : null;
      if (realPhone) {
        conversation = await promoteLidPeerToPhone(db, conversation, realPhone);
      }

      if (contact && realPhone) {
        contact = (await promoteLidContactToPhone(db, contact, realPhone, [phone, waLid])) ?? contact;
      }

      if (contact) {
        await upsertContactIdentities(db, contact.id, uniquePhones(phone, waLid, contact.phoneE164));
        conversation = await db.conversation.update({
          where: { id: conversation.id },
          data: {
            contactId: contact.id,
            condominiumId: contact.condominiumId ?? conversation.condominiumId,
            unidentified: false,
          },
        });
      }

      let ticketCreated = false;
      let linkedTicketId: string | null = null;
      const openTicket = await db.ticket.findFirst({
        where: { conversationId: conversation.id, status: { not: "resolvido" } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (openTicket) {
        linkedTicketId = openTicket.id;
      } else if (isInOperationalFlow(contact)) {
        const resolved = await db.ticket.findFirst({
          where: { conversationId: conversation.id, status: "resolvido" },
          select: { id: true },
        });
        if (resolved) {
          const opened = await tickets.openAfterResolved(conversation.id);
          if (opened) {
            linkedTicketId = opened.id;
            ticketCreated = opened.created;
          }
        }
      }

      let message;
      try {
        message = await db.message.create({
          data: {
            conversationId: conversation.id,
            ticketId: linkedTicketId,
            direction: "in",
            visibility: "publica",
            waMessageId: payload.waMessageId,
            sendStatus: "sent",
            body: payload.body.slice(0, 8000),
          },
        });
      } catch (error) {
        if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
          const existingDup = await db.message.findUnique({
            where: { waMessageId: payload.waMessageId },
            include: { conversation: { include: { triageItem: true } } },
          });
          if (existingDup) {
            return {
              created: false,
              conversationId: existingDup.conversationId,
              messageId: existingDup.id,
              unidentified: existingDup.conversation.unidentified,
              triageId: existingDup.conversation.triageItem?.id ?? null,
              ticketCreated: false,
            };
          }
        }
        throw error;
      }

      await db.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      let triageId: string | null = null;
      if (isInOperationalFlow(contact)) {
        let triage = await db.triageItem.findUnique({
          where: { conversationId: conversation.id },
        });
        if (!triage) {
          triage = await db.triageItem.create({
            data: { conversationId: conversation.id, status: "aberto" },
          });
        } else if (triage.status === "arquivado") {
          triage = await db.triageItem.update({
            where: { id: triage.id },
            data: { status: "aberto" },
          });
        }
        triageId = triage.id;
      }

      schedulePeerProfileEnrichment(
        conversation.id,
        inboundPeerEnrichOptions(conversation.peerPhoneE164, conversation.peerAvatarKey, payload.waMessageId),
      );

      try {
        await enqueueInboundJob(db, {
          created: true,
          inOperationalFlow: isInOperationalFlow(contact),
          condominiumId: conversation.condominiumId,
          messageId: message.id,
          conversationId: conversation.id,
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "ERROR";
        console.error(`[ai] enqueue errorCode=${code}`);
      }

      if (payload.mediaHint) {
        try {
          await enqueueMediaDownloadJob(db, {
            waMessageId: payload.waMessageId,
            conversationId: conversation.id,
          });
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "ERROR";
          console.error(`[ai] media enqueue errorCode=${code}`);
        }
      }

      try {
        await processInbound(db, {
          messageId: message.id,
          conversationId: conversation.id,
          contactId: conversation.contactId,
          createdAt: message.createdAt,
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "ERROR";
        console.error(`[automation] errorCode=${code}`);
      }

      return {
        created: true,
        conversationId: conversation.id,
        messageId: message.id,
        unidentified: conversation.unidentified,
        triageId,
        ticketCreated,
      };
    },

    /** Lazy PN + avatar (thread open / Vincular). Safe to call repeatedly. */
    async enrichPeerProfile(user: User, conversationId: string) {
      await this.getConversationForUser(user, conversationId);
      const lastInbound = await db.message.findFirst({
        where: { conversationId, direction: "in", waMessageId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { waMessageId: true },
      });
      const { enrichConversationPeerProfile } = await import("@/lib/services/peer-avatar-service");
      const result = await enrichConversationPeerProfile(conversationId, db, {
        deep: true,
        waMessageId: lastInbound?.waMessageId ?? undefined,
      });
      const row = await this.getConversationForUser(user, result.conversationId);
      return {
        ...row,
        peerAvatarUrl: peerAvatarPublicUrl(row.peerAvatarKey) || peerAvatarPublicUrl(row.contact?.avatarKey),
      };
    },

    async listConversations(
      user: User,
      page: number,
      pageSize: number,
      q?: string,
      filters?: { unread?: boolean; untreated?: boolean; unlinked?: boolean },
    ) {
      if (filters?.unlinked && !isAdmin(user)) {
        throw forbidden("Somente administradores veem números não vinculados");
      }
      const access: Prisma.ConversationWhereInput = isAdmin(user)
        ? {}
        : { tickets: { some: { assignedToId: user.id } } };
      const extra: Prisma.ConversationWhereInput[] = [];
      extra.push(filters?.unlinked ? outOfFlowConversationWhere : inFlowConversationWhere);
      if (q) {
        extra.push({
          OR: [
            { contact: { nome: { contains: q, mode: "insensitive" as const } } },
            { condominium: { nome: { contains: q, mode: "insensitive" as const } } },
            { peerPhoneE164: { contains: q, mode: "insensitive" as const } },
            { peerDisplayName: { contains: q, mode: "insensitive" as const } },
          ],
        });
      }
      if (filters?.untreated) extra.push({ triageItem: { is: { status: "aberto" } } });
      const where: Prisma.ConversationWhereInput = extra.length ? { AND: [access, ...extra] } : access;
      const fetchSize = filters?.unread ? 200 : pageSize;
      const fetchSkip = filters?.unread ? 0 : (page - 1) * pageSize;
      const [total, items] = await Promise.all([
        db.conversation.count({ where }),
        db.conversation.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: fetchSkip,
          take: fetchSize,
          include: {
            contact: true,
            condominium: true,
            connection: true,
            triageItem: true,
            tickets: {
              where: isAdmin(user) ? undefined : { assignedToId: user.id },
              select: { id: true, protocol: true, assignedToId: true, status: true, updatedAt: true },
              orderBy: { updatedAt: "desc" },
              take: 5,
            },
            messages: { where: { sendStatus: { not: "draft" } }, orderBy: { createdAt: "desc" }, take: 1 },
            reads: { select: { lastReadAt: true } },
          },
        }),
      ]);
      const cutoffById = new Map(items.map((row) => [row.id, latestOfficeReadAt(row.reads)]));
      const unopenedById = await unopenedInboundCounts(
        db,
        items.map((row) => row.id),
        cutoffById,
      );
      const mapped = items
        .map((row) => {
          const unopenedMessages = unopenedById.get(row.id) ?? 0;
          const { reads, ...rest } = row;
          void reads;
          return {
            ...rest,
            unopenedMessages,
            unread: unopenedMessages > 0,
            peerAvatarUrl:
              peerAvatarPublicUrl(row.peerAvatarKey) || peerAvatarPublicUrl(row.contact?.avatarKey),
          };
        })
        .filter((row) => (filters?.unread ? row.unread : true));
      if (filters?.unread) {
        const start = (page - 1) * pageSize;
        return { items: mapped.slice(start, start + pageSize), total: mapped.length, page, pageSize };
      }
      return { items: mapped, total, page, pageSize };
    },

    /** Devolve também as inbound que o cartão contava como Não aberta, lidas antes de avançar o corte. */
    async markRead(user: User, conversationId: string) {
      await this.getConversationForUser(user, conversationId);
      const reads = await db.conversationRead.findMany({
        where: { conversationId },
        select: { lastReadAt: true },
      });
      const cutoff = latestOfficeReadAt(reads);
      const unopened = await db.message.findMany({
        where: { conversationId, direction: "in", ...(cutoff ? { createdAt: { gt: cutoff } } : {}) },
        orderBy: { createdAt: "desc" },
        take: SELECTED_MESSAGE_LIMIT,
        select: { id: true },
      });
      const row = await db.conversationRead.upsert({
        where: { userId_conversationId: { userId: user.id, conversationId } },
        create: { userId: user.id, conversationId, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
      });
      return { ...row, unopenedMessageIds: unopened.map((message) => message.id).reverse() };
    },

    async removeFromSystem(user: User, conversationId: string) {
      const row = await this.getConversationForUser(user, conversationId);
      await db.$transaction(async (tx) => {
        await tx.message.updateMany({
          where: { conversationId },
          data: { replyToId: null },
        });
        await tx.ticket.updateMany({
          where: { conversationId },
          data: { conversationId: null },
        });
        await tx.conversation.delete({ where: { id: conversationId } });
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "conversation.removed_from_system",
        entityType: "conversation",
        entityId: conversationId,
        before: {
          peerPhoneE164: row.peerPhoneE164,
          ticketIds: row.tickets.map((t) => t.id),
        },
      });
      return { id: conversationId };
    },

    async getConversationForUser(user: User, id: string) {
      const row = await db.conversation.findFirst({
        where: { id },
        include: {
          contact: true,
          condominium: true,
          connection: true,
          triageItem: true,
          tickets: { select: { id: true, assignedToId: true, protocol: true }, take: 20 },
        },
      });
      if (!row) throw notFound("Conversa não encontrada");
      if (!isAdmin(user)) {
        const mine = row.tickets.some((t) => t.assignedToId === user.id);
        if (!mine) throw forbidden("Sem permissão para esta conversa");
      }
      return row;
    },

    async listMessages(user: User, conversationId: string, page: number, pageSize: number) {
      await this.getConversationForUser(user, conversationId);
      const total = await db.message.count({ where: { conversationId } });
      const { start, take } = messageWindow(total, page, pageSize);
      const items =
        take === 0
          ? []
          : await db.message.findMany({
              where: { conversationId },
              orderBy: { createdAt: "asc" },
              skip: start,
              take,
              include: {
                attachments: true,
                replyTo: { select: { id: true, body: true, direction: true } },
              },
            });
      return { items, total, page, pageSize };
    },

    async postMessage(
      user: User,
      conversationId: string,
      input: {
        body: string;
        visibility: "publica" | "interna";
        file?: { buffer: Buffer; name: string; mime: string };
        ticketId?: string;
        replyToId?: string;
      },
    ) {
      const conversation = await this.getConversationForUser(user, conversationId);
      const ticketId =
        input.ticketId ||
        conversation.tickets.find((t) => (isAdmin(user) ? true : t.assignedToId === user.id))?.id ||
        null;
      const visibility = input.visibility;

      if (visibility === "interna") {
        const message = await db.message.create({
          data: {
            conversationId,
            ticketId,
            direction: "out",
            visibility: "interna",
            sendStatus: "draft",
            body: input.body.slice(0, 8000),
          },
        });
        return { message, sentToWhatsApp: false };
      }

      const canSendNow = canSendPublicWhatsApp(user);
      const canDraftForApproval = Boolean(user.apenasRascunho) && Boolean(user.podeResponderCliente) && !isAdmin(user);
      if (!canSendNow && !canDraftForApproval) {
        throw forbidden("Este perfil não pode responder o cliente");
      }
      const outOfFlow = !conversation.contactId || !conversation.condominiumId;
      if (outOfFlow && !isAdmin(user)) {
        throw forbidden("Somente administradores respondem números fora do fluxo");
      }
      if (
        !sendableWhatsAppE164({
          contactPhoneE164: conversation.contact?.phoneE164,
          peerPhoneE164: conversation.peerPhoneE164,
        }) &&
        !isLidPeer(conversation.peerPhoneE164)
      ) {
        throw unprocessable("Não foi possível enviar neste chat.");
      }
      if (!input.body.trim() && !input.file) {
        throw unprocessable("Informe mensagem ou arquivo");
      }

      let replyToId: string | undefined;
      if (input.replyToId) {
        const quoted = await db.message.findFirst({
          where: { id: input.replyToId, conversationId },
        });
        if (!quoted) throw unprocessable("Mensagem citada não pertence a esta conversa");
        replyToId = quoted.id;
      }

      let attachmentData = undefined as
        | { storageKey: string; mime: string; sizeBytes: number; originalName: string }
        | undefined;
      if (input.file) {
        attachmentData = await localDiskStorage.save(input.file.buffer, input.file.name, input.file.mime);
      }

      if (canDraftForApproval) {
        const draft = await db.message.create({
          data: {
            conversationId,
            ticketId,
            replyToId,
            direction: "out",
            visibility: "publica",
            sendStatus: "draft",
            body: (input.body || input.file?.name || "").slice(0, 8000),
            attachments: attachmentData ? { create: attachmentData } : undefined,
          },
          include: { attachments: true },
        });
        await writeAudit(db, {
          actorId: user.id,
          action: "message.draft",
          entityType: "message",
          entityId: draft.id,
          after: { conversationId, ticketId, visibility: "publica", sendStatus: "draft" },
        });
        return { message: draft, sentToWhatsApp: false, awaitingApproval: true };
      }

      const created = await db.message.create({
        data: {
          conversationId,
          ticketId,
          replyToId,
          direction: "out",
          visibility: "publica",
          sendStatus: "pending",
          body: (input.body || input.file?.name || "").slice(0, 8000),
          attachments: attachmentData ? { create: attachmentData } : undefined,
        },
        include: { attachments: true },
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "message.send_queued",
        entityType: "message",
        entityId: created.id,
        after: { conversationId, ticketId, visibility: "publica" },
      });
      const message = await dispatchToWhatsApp(db, user, created.id);
      return { message, sentToWhatsApp: message.sendStatus === "sent", awaitingApproval: false };
    },

    async dashboardKpis(user: User) {
      const ticketWhere = isAdmin(user) ? {} : { assignedToId: user.id };
      const access: Prisma.ConversationWhereInput = isAdmin(user)
        ? inFlowConversationWhere
        : { AND: [inFlowConversationWhere, { tickets: { some: { assignedToId: user.id } } }] };
      const ticketListSelect = {
        id: true,
        protocol: true,
        title: true,
        status: true,
        priority: true,
        updatedAt: true,
        condominium: { select: { nome: true } },
        contact: { select: { nome: true } },
      } as const;
      const [abertos, emAndamento, aguardando, semResponsavel, altaUrgente, rascunhos, unreadRows] = await Promise.all([
        db.ticket.count({ where: { ...ticketWhere, status: "aberto" } }),
        db.ticket.count({ where: { ...ticketWhere, status: "em_andamento" } }),
        db.ticket.count({ where: { ...ticketWhere, status: "aguardando" } }),
        isAdmin(user) ? db.ticket.count({ where: { assignedToId: null } }) : Promise.resolve(0),
        db.ticket.count({ where: { ...ticketWhere, priority: { in: ["alta", "urgente"] }, status: { not: "resolvido" } } }),
        db.message.count({
          where: {
            sendStatus: "draft",
            visibility: "publica",
            ...(isAdmin(user) ? {} : { ticket: { assignedToId: user.id } }),
          },
        }),
        db.conversation.findMany({
          where: access,
          select: {
            id: true,
            reads: { select: { lastReadAt: true } },
          },
        }),
      ]);
      const unopenedById = await unopenedInboundCounts(
        db,
        unreadRows.map((row) => row.id),
        new Map(unreadRows.map((row) => [row.id, latestOfficeReadAt(row.reads)])),
      );
      const naoLidas = [...unopenedById.values()].reduce((sum, n) => sum + n, 0);
      if (!isAdmin(user)) {
        const [meus, meusChamadosLista] = await Promise.all([
          db.ticket.count({
            where: { assignedToId: user.id, status: { not: "resolvido" } },
          }),
          db.ticket.findMany({
            where: { assignedToId: user.id, status: { not: "resolvido" } },
            orderBy: { updatedAt: "desc" },
            take: 8,
            select: ticketListSelect,
          }),
        ]);
        return {
          triagem: 0,
          naoIdent: 0,
          naoVinculados: 0,
          naoLidas,
          conexao: null,
          enviosFalhos: 0,
          recent: [] as unknown[],
          connections: [] as unknown[],
          meusChamados: meus,
          meusChamadosLista,
          abertos,
          emAndamento,
          aguardando,
          semResponsavel: 0,
          altaUrgente,
          rascunhos,
        };
      }
      const [triagem, naoVinculados, conexao, enviosFalhos, recent, connections, meusChamadosLista] = await Promise.all([
        db.triageItem.count({
          where: { status: "aberto", conversation: inFlowConversationWhere },
        }),
        db.conversation.count({ where: outOfFlowConversationWhere }),
        db.channelConnection.findFirst({
          where: { type: { in: ["evolution_baileys", "dev_mock"] } },
          orderBy: { updatedAt: "desc" },
        }),
        db.message.count({ where: { sendStatus: "failed" } }),
        db.conversation.findMany({
          where: inFlowConversationWhere,
          orderBy: { updatedAt: "desc" },
          take: 8,
          include: { contact: true, condominium: true },
        }),
        db.channelConnection.findMany({ orderBy: { createdAt: "asc" } }),
        db.ticket.findMany({
          where: { status: { not: "resolvido" } },
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: ticketListSelect,
        }),
      ]);
      const conexaoLive = await withLiveBaileysStatus(conexao);
      return {
        triagem,
        naoIdent: naoVinculados,
        naoVinculados,
        naoLidas,
        conexao: conexaoLive,
        enviosFalhos,
        recent,
        connections,
        meusChamadosLista,
        abertos,
        emAndamento,
        aguardando,
        semResponsavel,
        altaUrgente,
        rascunhos,
      };
    },

    async ingestOwnOutbound(payload: OwnOutboundPayload) {
      const connectionId = payload.connectionId || (await db.channelConnection.findFirst({ where: { type: payload.connectionType } }))?.id;
      if (!connectionId) return { created: false, conversationId: null, messageId: null };

      const fromPhone = typeof payload.fromPhone === "string" ? payload.fromPhone : "";
      const waLid = typeof payload.waLid === "string" && payload.waLid ? payload.waLid : null;
      const conversation = await db.conversation.findFirst({
        where: {
          connectionId,
          OR: [
            ...(fromPhone ? [{ peerPhoneE164: fromPhone }, { peerLid: fromPhone }] : []),
            ...(waLid ? [{ peerLid: waLid }, { peerPhoneE164: waLid }] : []),
          ],
        },
      });

      if (!conversation) return { created: false, conversationId: null, messageId: null };

      const body = String(payload.body ?? "").slice(0, 8000);
      const twinSince = new Date(Date.now() - 2 * 60 * 1000);
      const twin = await db.message.findFirst({
        where: {
          conversationId: conversation.id,
          direction: "out",
          body,
          waMessageId: null,
          createdAt: { gte: twinSince },
        },
        orderBy: { createdAt: "desc" },
      });
      if (twin) {
        const updated = await db.message.update({
          where: { id: twin.id },
          data: { waMessageId: payload.waMessageId, sendStatus: "sent" },
        });
        return { created: false, conversationId: conversation.id, messageId: updated.id };
      }

      const sentAtDate = payload.sentAt ? new Date(payload.sentAt) : null;
      const createdAt = sentAtDate && !Number.isNaN(sentAtDate.getTime()) ? sentAtDate : undefined;

      try {
        const message = await db.message.create({
          data: {
            conversationId: conversation.id,
            direction: "out",
            visibility: "publica",
            waMessageId: payload.waMessageId,
            sendStatus: "sent",
            body,
            ...(createdAt ? { createdAt } : {}),
          },
        });
        return { created: true, conversationId: conversation.id, messageId: message.id };
      } catch (error) {
        if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
          const existing = await db.message.findFirst({ where: { waMessageId: payload.waMessageId } });
          if (existing) return { created: false, conversationId: existing.conversationId, messageId: existing.id };
        }
        throw error;
      }
    },

    async syncOwnOutboundMessages(user: User, conversationId: string) {
      // Valida que o usuário pode ver a conversa
      await this.getConversationForUser(user, conversationId);

      const conversation = await db.conversation.findFirst({
        where: { id: conversationId },
      });
      if (!conversation) return { synced: 0 };

      // Cooldown de 2 minutos por conversa
      const now = Date.now();
      const lastSync = ownSyncCooldown.get(conversationId);
      if (lastSync && now - lastSync < OWN_SYNC_COOLDOWN_MS) {
        return { synced: 0 };
      }
      ownSyncCooldown.set(conversationId, now);

      // Prepara o JID remoto para consultar a Evolution
      let remoteJid: string | null = null;
      if (isLidPeer(conversation.peerPhoneE164)) {
        // Para LID, usar o mesmo placeholder
        remoteJid = null; // fetchEvolutionMessages com LID não funciona bem; pular sync
      } else {
        remoteJid = peerToRemoteJid(conversation.peerPhoneE164);
      }

      if (!remoteJid) {
        return { synced: 0 };
      }

      // Busca até 50 mensagens fromMe da Evolution
      let rows: unknown[] | null = null;
      try {
        rows = await fetchEvolutionMessages({
          remoteJid,
          limit: OWN_SYNC_LIMIT,
        });
      } catch {
        // Evolution offline ou erro — continuar sem sincronizar
        return { synced: 0 };
      }

      if (!rows || rows.length === 0) {
        return { synced: 0 };
      }

      // Interpreta como webhook
      const parsed = interpretEvolutionMessageRows(rows);
      if (parsed.kind !== "messages") {
        return { synced: 0 };
      }

      // Filtra só fromMe
      const ownMessages = parsed.items.filter((item) => item.fromMe);
      if (ownMessages.length === 0) {
        return { synced: 0 };
      }

      // Importa as que ainda não estão no banco
      let synced = 0;
      for (const item of ownMessages) {
        const existing = await db.message.findFirst({
          where: { waMessageId: item.waMessageId },
        });
        if (existing) continue;

        const result = await this.ingestOwnOutbound({
          waMessageId: item.waMessageId,
          fromPhone: item.fromPhone,
          waLid: item.waLid,
          body: item.body,
          sentAt: item.sentAt,
          connectionId: conversation.connectionId,
        });
        if (result.created || (result.messageId && !result.created)) {
          synced++;
        }
      }

      return { synced };
    },
  };
}

export const atendimentoService = createAtendimentoService();
