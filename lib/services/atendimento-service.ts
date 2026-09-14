import type { ChannelType, Prisma, PrismaClient, User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable, AppError } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { normalizeE164 } from "@/lib/phone/e164";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { providerFor } from "@/lib/channels/resolve-provider";
import { isBaileysSessionOpen, mapBaileysLiveToDb } from "@/lib/channels/evolution-send";
import { deadlineService } from "@/lib/services/deadline-service";

export type InboundPayload = {
  waMessageId: string;
  fromPhone: string;
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

      const connection = payload.connectionId
        ? await db.channelConnection.findFirst({ where: { id: payload.connectionId } })
        : await db.channelConnection.findFirst({
            where: { type: payload.connectionType ?? "dev_mock" },
            orderBy: { createdAt: "asc" },
          });
      if (!connection) throw unprocessable("Nenhuma conexão disponível para ingestão");

      const contact = await db.contact.findFirst({
        where: { phoneE164: phone, deletedAt: null },
      });

      let conversation = await db.conversation.findFirst({
        where: contact
          ? { contactId: contact.id, connectionId: connection.id }
          : { unidentified: true, connectionId: connection.id, contactId: null },
        orderBy: { updatedAt: "desc" },
      });

      if (!conversation) {
        conversation = await db.conversation.create({
          data: {
            connectionId: connection.id,
            contactId: contact?.id ?? null,
            condominiumId: contact?.condominiumId ?? null,
            unidentified: !contact,
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

      return {
        created: true,
        conversationId: conversation.id,
        messageId: message.id,
        unidentified: conversation.unidentified,
        triageId: triage.id,
        ticketCreated: false,
      };
    },

    async listConversations(user: User, page: number, pageSize: number, q?: string) {
      const access: Prisma.ConversationWhereInput = isAdmin(user)
        ? {}
        : { tickets: { some: { assignedToId: user.id } } };
      const search: Prisma.ConversationWhereInput = q
        ? {
            OR: [
              { contact: { nome: { contains: q, mode: "insensitive" as const } } },
              { condominium: { nome: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {};
      const where: Prisma.ConversationWhereInput = q ? { AND: [access, search] } : access;
      const [total, items] = await Promise.all([
        db.conversation.count({ where }),
        db.conversation.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
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
          },
        }),
      ]);
      return { items, total, page, pageSize };
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
          include: { attachments: true },
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

      if (user.apenasRascunho) {
        let attachmentData = undefined as
          | { storageKey: string; mime: string; sizeBytes: number; originalName: string }
          | undefined;
        if (input.file) {
          attachmentData = await localDiskStorage.save(input.file.buffer, input.file.name, input.file.mime);
        }
        const message = await db.message.create({
          data: {
            conversationId,
            ticketId,
            direction: "out",
            visibility: "publica",
            sendStatus: "draft",
            body: input.body.slice(0, 8000),
            attachments: attachmentData ? { create: attachmentData } : undefined,
          },
          include: { attachments: true },
        });
        return { message, sentToWhatsApp: false, awaitingApproval: true };
      }

      if (!user.podeResponderCliente) {
        throw forbidden("Este perfil não pode responder o cliente");
      }
      if (conversation.connection.type === "evolution_baileys") {
        const provider = providerFor(conversation.connection.type);
        const live = await provider.getStatus();
        const mapped = mapBaileysLiveToDb(live.status);
        if (mapped) {
          await db.channelConnection.update({
            where: { id: conversation.connection.id },
            data: { status: mapped },
          });
        }
        if (!isBaileysSessionOpen(live.status)) {
          throw unprocessable(
            "WhatsApp Web não está conectado. Abra Conexões, atualize o status e escaneie o QR se precisar.",
            { liveStatus: live.status, detail: live.detail },
          );
        }
      } else if (conversation.connection.status !== "open") {
        throw unprocessable("Conexão não está aberta para envio");
      }
      if (conversation.unidentified || !conversation.contact?.phoneE164) {
        throw unprocessable("Identifique o contato antes de responder no WhatsApp");
      }

      let attachmentData = undefined as
        | { storageKey: string; mime: string; sizeBytes: number; originalName: string }
        | undefined;
      if (input.file) {
        attachmentData = await localDiskStorage.save(input.file.buffer, input.file.name, input.file.mime);
      }

      const provider = providerFor(conversation.connection.type);
      try {
        let sent;
        if (input.file && attachmentData) {
          sent = await provider.sendMedia({
            toE164: conversation.contact.phoneE164,
            body: input.body,
            mime: attachmentData.mime,
            fileName: attachmentData.originalName,
            buffer: input.file.buffer,
          });
        } else {
          sent = await provider.send({
            toE164: conversation.contact.phoneE164,
            body: input.body,
          });
        }
        const message = await db.message.create({
          data: {
            conversationId,
            ticketId,
            direction: "out",
            visibility: "publica",
            sendStatus: "sent",
            waMessageId: sent.waMessageId,
            body: input.body.slice(0, 8000),
            attachments: attachmentData ? { create: attachmentData } : undefined,
          },
          include: { attachments: true },
        });
        await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        return { message, sentToWhatsApp: true };
      } catch (error) {
        const message = await db.message.create({
          data: {
            conversationId,
            ticketId,
            direction: "out",
            visibility: "publica",
            sendStatus: "failed",
            body: input.body.slice(0, 8000),
            attachments: attachmentData ? { create: attachmentData } : undefined,
          },
          include: { attachments: true },
        });
        const cause = error instanceof Error ? error.message : "provider";
        throw unprocessable(error instanceof AppError ? error.message : "Falha no envio ao canal", {
          messageId: message.id,
          cause,
        });
      }
    },

    async dashboardKpis(user: User) {
      const prazosVencidos = await deadlineService.countOverdue(user);
      if (!isAdmin(user)) {
        const meus = await db.ticket.count({
          where: { assignedToId: user.id, status: { not: "resolvido" } },
        });
        return {
          triagem: 0,
          naoIdent: 0,
          conexao: null,
          enviosFalhos: 0,
          recent: [] as unknown[],
          connections: [] as unknown[],
          prazosVencidos,
          meusChamados: meus,
        };
      }
      const [triagem, naoIdent, conexao, enviosFalhos, recent, connections] = await Promise.all([
        db.triageItem.count({ where: { status: "aberto" } }),
        db.conversation.count({ where: { unidentified: true } }),
        db.channelConnection.findFirst({
          where: { type: { in: ["evolution_baileys", "dev_mock"] } },
          orderBy: { updatedAt: "desc" },
        }),
        db.message.count({ where: { sendStatus: "failed" } }),
        db.conversation.findMany({
          orderBy: { updatedAt: "desc" },
          take: 8,
          include: { contact: true, condominium: true },
        }),
        db.channelConnection.findMany({ orderBy: { createdAt: "asc" } }),
      ]);
      return { triagem, naoIdent, conexao, enviosFalhos, recent, connections, prazosVencidos };
    },
  };
}

export const atendimentoService = createAtendimentoService();
