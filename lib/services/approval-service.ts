import type { PrismaClient, User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isMissingTable, isUniqueConflict } from "@/lib/ai/errors";
import { isInternalOperationalDraft } from "@/lib/ai/client-draft-guard";
import { writeAudit } from "@/lib/services/audit-service";
import { canSendPublicWhatsApp, resendFailedMessage } from "@/lib/services/whatsapp-dispatch";

async function draftAnalise(db: PrismaClient, messageId: string): Promise<string | null> {
  const table = db.aiTicketMemoryRevision;
  if (!table?.findFirst) return null;
  try {
    const revision = await table.findFirst({
      where: { interaction: { draftMessageId: messageId } },
      select: { summaryJson: true },
    });
    if (!revision?.summaryJson || typeof revision.summaryJson !== "object" || Array.isArray(revision.summaryJson)) return null;
    const analise = (revision.summaryJson as { analise?: unknown }).analise;
    return typeof analise === "string" ? analise : null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function findDraftInteraction(db: PrismaClient, messageId: string) {
  try {
    return await db.aiInteraction.findFirst({
      where: { draftMessageId: messageId },
      select: { id: true, status: true, conversationId: true, ticketId: true },
    });
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export function createApprovalService(db: PrismaClient = defaultPrisma) {
  return {
    async approve(user: User, messageId: string) {
      const interaction = await findDraftInteraction(db, messageId);
      if (interaction?.status === "rejected") {
        throw unprocessable("Rascunho rejeitado não pode ser enviado");
      }
      const message = await db.message.findFirst({
        where: { id: messageId },
        select: { body: true },
      });
      if (message && isInternalOperationalDraft(message.body, await draftAnalise(db, messageId))) {
        throw unprocessable("Análise interna não pode ser enviada ao cliente");
      }
      return resendFailedMessage(db, user, messageId);
    },
    async reject(user: User, messageId: string) {
      if (!canSendPublicWhatsApp(user)) throw forbidden("Este perfil não pode responder o cliente");
      const message = await db.message.findFirst({ where: { id: messageId } });
      if (!message) throw notFound("Mensagem não encontrada");
      if (message.direction !== "out" || message.visibility !== "publica" || message.sendStatus !== "draft") {
        throw unprocessable("Somente rascunho público pode ser rejeitado");
      }
      const interaction = await findDraftInteraction(db, messageId);
      if (interaction && interaction.status !== "rejected") {
        await db.aiInteraction.update({ where: { id: interaction.id }, data: { status: "rejected" } });
        await db.aiAuditEvent.create({
          data: {
            action: "REJECTED",
            conversationId: interaction.conversationId,
            ticketId: interaction.ticketId,
            interactionId: interaction.id,
            actorId: user.id,
            result: "rejected",
          },
        });
      } else if (!interaction) {
        try {
          await db.aiInteraction.create({
            data: {
              conversationId: message.conversationId,
              ticketId: message.ticketId,
              idempotencyKey: `reject:${message.id}`,
              status: "rejected",
              contextVersion: "human",
            },
          });
        } catch (error) {
          if (!isUniqueConflict(error) && !isMissingTable(error)) throw error;
        }
      }
      await writeAudit(db, {
        actorId: user.id,
        action: "message.draft_rejected",
        entityType: "message",
        entityId: message.id,
        after: { sendStatus: "draft", aiStatus: "rejected" },
      });
      return message;
    },
  };
}

export const approvalService = createApprovalService();
