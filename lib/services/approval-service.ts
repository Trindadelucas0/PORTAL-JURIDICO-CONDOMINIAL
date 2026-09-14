import type { PrismaClient, User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { providerFor } from "@/lib/channels/resolve-provider";

export function createApprovalService(db: PrismaClient = defaultPrisma) {
  return {
    async approve(user: User, messageId: string) {
      if (!isAdmin(user)) throw forbidden("Somente administradores aprovam envio");
      const message = await db.message.findFirst({
        where: { id: messageId },
        include: {
          attachments: true,
          conversation: { include: { contact: true, connection: true } },
        },
      });
      if (!message) throw notFound("Mensagem não encontrada");
      if (message.visibility === "interna") {
        throw unprocessable("Nota interna nunca é enviada ao WhatsApp");
      }
      if (message.sendStatus !== "draft") {
        throw unprocessable("Somente rascunho pode ser aprovado");
      }
      const conversation = message.conversation;
      if (conversation.connection.status !== "open") {
        throw unprocessable("Conexão não está aberta para envio");
      }
      const phone = conversation.contact?.phoneE164;
      if (!phone) throw unprocessable("Identifique o contato antes de enviar");

      const provider = providerFor(conversation.connection.type);
      try {
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
          });
        } else {
          sent = await provider.send({ toE164: phone, body: message.body });
        }
        return db.message.update({
          where: { id: message.id },
          data: { sendStatus: "sent", waMessageId: sent.waMessageId },
          include: { attachments: true },
        });
      } catch (error) {
        await db.message.update({
          where: { id: message.id },
          data: { sendStatus: "failed" },
        });
        throw unprocessable("Falha no envio ao canal", {
          messageId: message.id,
          cause: error instanceof Error ? error.message : "provider",
        });
      }
    },
  };
}

export const approvalService = createApprovalService();
