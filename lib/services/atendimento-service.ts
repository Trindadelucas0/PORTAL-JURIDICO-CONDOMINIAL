import type { ChannelType, Conversation, Prisma, PrismaClient, User } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { normalizeE164 } from "@/lib/phone/e164";
import { e164LookupValues, isLidPeer, uniquePhones } from "@/lib/phone/identity";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { deadlineService } from "@/lib/services/deadline-service";
import { writeAudit } from "@/lib/services/audit-service";
import { canSendPublicWhatsApp, dispatchToWhatsApp } from "@/lib/services/whatsapp-dispatch";
import { findContactByPhones, upsertContactIdentities } from "@/lib/services/contact-identity";
import { mergeConversations } from "@/lib/services/conversation-merge";
import {
  inFlowConversationWhere,
  isInOperationalFlow,
  outOfFlowConversationWhere,
  sendableWhatsAppE164,
} from "@/lib/services/operational-flow";

export type InboundPayload = {
  waMessageId: string;
  fromPhone: string;
  waLid?: string | null;
  body: string;
  connectionId?: string;
  connectionType?: ChannelType;
};

export type IngestResult = {
  created: boolean;
  conversationId: string;
  messageId: string;
  unidentified: boolean;
  triageId: string | null;
  ticketCreated: false;
};

async function promoteLidPeerToPhone(
  db: PrismaClient,
  conversation: Conversation,
  phone: string,
): Promise<Conversation> {
  if (!isLidPeer(conversation.peerPhoneE164) || isLidPeer(phone)) return conversation;
  try {
    return await db.conversation.update({
      where: { id: conversation.id },
      data: { peerPhoneE164: phone },
    });
  } catch (error) {
    if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
      const other = await db.conversation.findFirst({
        where: { connectionId: conversation.connectionId, peerPhoneE164: phone },
      });
      if (other && other.id !== conversation.id) {
        await mergeConversations(db, other.id, conversation.id);
        return (await db.conversation.findFirst({ where: { id: other.id } })) ?? other;
      }
    } else {
      throw error;
    }
  }
  return conversation;
}

export function createAtendimentoService(db: PrismaClient = defaultPrisma) {
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

      const contact = await findContactByPhones(db, lookupKeys);
      const or: Prisma.ConversationWhereInput[] = [{ peerPhoneE164: { in: lookupKeys } }];
      if (contact) or.push({ contactId: contact.id });
      let matches = await db.conversation.findMany({
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

      const realPhone = !isLidPeer(phone) ? phone : contact && !isLidPeer(contact.phoneE164) ? contact.phoneE164 : null;
      if (realPhone) {
        conversation = await promoteLidPeerToPhone(db, conversation, realPhone);
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

      const linkedTicket = await db.ticket.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
      });

      const message = await db.message.create({
        data: {
          conversationId: conversation.id,
          ticketId: linkedTicket?.id ?? null,
          direction: "in",
          visibility: "publica",
          waMessageId: payload.waMessageId,
          sendStatus: "sent",
          body: payload.body.slice(0, 8000),
        },
      });

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

      return {
        created: true,
        conversationId: conversation.id,
        messageId: message.id,
        unidentified: conversation.unidentified,
        triageId,
        ticketCreated: false,
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
              select: { id: true, protocol: true, assignedToId: true, status: true },
              take: 5,
            },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
            reads: { where: { userId: user.id }, take: 1 },
          },
        }),
      ]);
      const mapped = items
        .map((row) => {
          const lastRead = row.reads[0]?.lastReadAt;
          const unread = !lastRead || lastRead < row.updatedAt;
          const { reads, ...rest } = row;
          void reads;
          return { ...rest, unread };
        })
        .filter((row) => (filters?.unread ? row.unread : true));
      if (filters?.unread) {
        const start = (page - 1) * pageSize;
        return { items: mapped.slice(start, start + pageSize), total: mapped.length, page, pageSize };
      }
      return { items: mapped, total, page, pageSize };
    },

    async markRead(user: User, conversationId: string) {
      await this.getConversationForUser(user, conversationId);
      return db.conversationRead.upsert({
        where: { userId_conversationId: { userId: user.id, conversationId } },
        create: { userId: user.id, conversationId, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
      });
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
      const [total, items] = await Promise.all([
        db.message.count({ where: { conversationId } }),
        db.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            attachments: true,
            replyTo: { select: { id: true, body: true, direction: true } },
          },
        }),
      ]);
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

      if (!canSendPublicWhatsApp(user)) {
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
      const prazosVencidos = await deadlineService.countOverdue(user);
      const prazosProximos = await deadlineService.countDueSoon(user);
      const ticketWhere = isAdmin(user) ? {} : { assignedToId: user.id };
      const [abertos, emAndamento, aguardando, semResponsavel, altaUrgente, rascunhos] = await Promise.all([
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
      ]);
      if (!isAdmin(user)) {
        const meus = await db.ticket.count({
          where: { assignedToId: user.id, status: { not: "resolvido" } },
        });
        return {
          triagem: 0,
          naoIdent: 0,
          naoVinculados: 0,
          conexao: null,
          enviosFalhos: 0,
          recent: [] as unknown[],
          connections: [] as unknown[],
          prazosVencidos,
          prazosProximos,
          meusChamados: meus,
          abertos,
          emAndamento,
          aguardando,
          semResponsavel: 0,
          altaUrgente,
          rascunhos,
        };
      }
      const [triagem, naoVinculados, conexao, enviosFalhos, recent, connections] = await Promise.all([
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
      ]);
      return {
        triagem,
        naoIdent: naoVinculados,
        naoVinculados,
        conexao,
        enviosFalhos,
        recent,
        connections,
        prazosVencidos,
        prazosProximos,
        abertos,
        emAndamento,
        aguardando,
        semResponsavel,
        altaUrgente,
        rascunhos,
      };
    },
  };
}

export const atendimentoService = createAtendimentoService();
