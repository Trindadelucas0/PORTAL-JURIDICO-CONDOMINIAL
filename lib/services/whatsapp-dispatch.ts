import { Prisma, type PrismaClient, type User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { providerFor } from "@/lib/channels/resolve-provider";
import { isBaileysSessionOpen, mapBaileysLiveToDb } from "@/lib/channels/evolution-send";
import { writeAudit } from "@/lib/services/audit-service";
import { sendableWhatsAppE164 } from "@/lib/services/operational-flow";
import { isLidPeer } from "@/lib/phone/identity";
import { resolveLidJidForPlaceholder } from "@/lib/channels/evolution-lid-map";

export function canSendPublicWhatsApp(user: User) {
  if (isAdmin(user)) return true;
  return Boolean(user.podeResponderCliente) && !user.apenasRascunho;
}

export async function resolveWhatsAppSendDestination(conversation: {
  contact?: { phoneE164: string } | null;
  peerPhoneE164: string;
  connection: { type: string };
}): Promise<string | null> {
  const phone = sendableWhatsAppE164({
    contactPhoneE164: conversation.contact?.phoneE164,
    peerPhoneE164: conversation.peerPhoneE164,
  });
  if (phone) return phone;
  if (!isLidPeer(conversation.peerPhoneE164)) return null;
  if (conversation.connection.type === "dev_mock") return conversation.peerPhoneE164;
  return resolveLidJidForPlaceholder(conversation.peerPhoneE164);
}

async function assertConversationAccess(db: PrismaClient, user: User, conversationId: string) {
  const row = await db.conversation.findFirst({
    where: { id: conversationId },
    include: { tickets: { select: { assignedToId: true } } },
  });
  if (!row) throw notFound("Conversa não encontrada");
  if (!isAdmin(user)) {
    const mine = row.tickets.some((t) => t.assignedToId === user.id);
    if (!mine) throw forbidden("Sem permissão para esta conversa");
  }
}

export async function deliverStoredPublicMessage(db: PrismaClient | Prisma.TransactionClient, messageId: string) {
  const message = await db.message.findFirst({
    where: { id: messageId },
    include: {
      attachments: true,
      replyTo: true,
      conversation: { include: { contact: true, connection: true } },
    },
  });
  if (!message) throw notFound("Mensagem não encontrada");
  if (message.visibility === "interna") {
    throw unprocessable("Nota interna nunca é enviada ao WhatsApp");
  }
  if (message.direction !== "out") {
    throw unprocessable("Somente mensagem de saída pode ser enviada");
  }

  const conversation = message.conversation;
  try {
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
    const phone = await resolveWhatsAppSendDestination(conversation);
    if (!phone) {
      throw unprocessable(
        "Não foi possível localizar este chat no WhatsApp para enviar. Cadastre o telefone se a resposta não sair.",
      );
    }

    const provider = providerFor(conversation.connection.type);
    const quotedWaMessageId = message.replyTo?.waMessageId || undefined;
    const attachment = message.attachments[0];
    let sent;
    if (attachment) {
      const file = await localDiskStorage.read(attachment.storageKey);
      sent = await provider.sendMedia({
        toE164: phone,
        body: message.body,
        mime: attachment.mime,
        fileName: attachment.originalName,
        buffer: file.buffer,
        quotedWaMessageId,
        ptt: attachment.mime.startsWith("audio/"),
      });
    } else {
      sent = await provider.send({ toE164: phone, body: message.body, quotedWaMessageId });
    }
    const updated = await db.message.update({
      where: { id: message.id },
      data: { sendStatus: "sent", waMessageId: sent.waMessageId },
      include: { attachments: true, replyTo: { select: { id: true, body: true, direction: true } } },
    });
    await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return updated;
  } catch (error) {
    await db.message.update({
      where: { id: message.id },
      data: { sendStatus: "failed" },
    });
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 422) {
      throw error;
    }
    throw unprocessable("Falha no envio ao canal", {
      messageId: message.id,
      cause: error instanceof Error ? error.message : "provider",
    });
  }
}

export async function dispatchToWhatsApp(db: PrismaClient, user: User, messageId: string) {
  const message = await db.message.findFirst({
    where: { id: messageId },
    select: { id: true, conversationId: true, visibility: true, direction: true, sendStatus: true },
  });
  if (!message) throw notFound("Mensagem não encontrada");
  if (message.visibility === "interna") {
    throw unprocessable("Nota interna nunca é enviada ao WhatsApp");
  }
  if (message.direction !== "out") {
    throw unprocessable("Somente mensagem de saída pode ser enviada");
  }
  await assertConversationAccess(db, user, message.conversationId);

  try {
    const updated = await deliverStoredPublicMessage(db, messageId);
    await writeAudit(db, {
      actorId: user.id,
      action: "message.send",
      entityType: "message",
      entityId: message.id,
      before: { sendStatus: message.sendStatus },
      after: { sendStatus: "sent" },
    });
    return updated;
  } catch (error) {
    await writeAudit(db, {
      actorId: user.id,
      action: "message.send_failed",
      entityType: "message",
      entityId: message.id,
      after: { sendStatus: "failed" },
    });
    throw error;
  }
}

export async function resendFailedMessage(db: PrismaClient = defaultPrisma, user: User, messageId: string) {
  if (!canSendPublicWhatsApp(user)) throw forbidden("Este perfil não pode responder o cliente");
  const message = await db.message.findFirst({ where: { id: messageId } });
  if (!message) throw notFound("Mensagem não encontrada");
  if (message.sendStatus !== "failed" && message.sendStatus !== "draft") {
    throw unprocessable("Somente rascunho antigo ou envio falho pode ser reenviado");
  }
  return dispatchToWhatsApp(db, user, messageId);
}
