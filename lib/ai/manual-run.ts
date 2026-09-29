import type { PrismaClient } from "@prisma/client";
import { unprocessable } from "@/lib/api/errors";
import { enqueueManualInbound, isMessageUuid } from "@/lib/ai/enqueue";
import { isAiEnabled } from "@/lib/ai/flags";
import { SELECTED_MESSAGE_LIMIT } from "@/lib/ai/package";

export async function startManualAiRun(
  db: PrismaClient,
  input: { conversationId: string; condominiumId: string | null; messageIds?: string[] },
): Promise<{ queued: true }> {
  if (!isAiEnabled()) throw unprocessable("A IA está desligada neste ambiente");
  if (!input.condominiumId) throw unprocessable("Vincule o condomínio antes");
  const selected = input.messageIds
    ? await assertSelectedMessages(db, input.conversationId, input.messageIds)
    : undefined;
  if (!selected) {
    const inbound = await db.message.count({
      where: { conversationId: input.conversationId, direction: "in" },
    });
    if (inbound === 0) throw unprocessable("Não há mensagem do cliente para a IA ler");
  }
  const result = await enqueueManualInbound(db, input.conversationId, selected);
  if (!result.queued) throw unprocessable("Não foi possível enfileirar a IA");
  return { queued: true };
}

/** 1 a 40 ids, todos `Message` desta conversa (entrada ou saída). */
async function assertSelectedMessages(db: PrismaClient, conversationId: string, messageIds: string[]): Promise<string[]> {
  const ids = [...new Set(messageIds)];
  if (ids.length === 0) throw unprocessable("Marque ao menos uma mensagem");
  if (ids.length > SELECTED_MESSAGE_LIMIT) {
    throw unprocessable(`Marque no máximo ${SELECTED_MESSAGE_LIMIT} mensagens`);
  }
  if (!ids.every(isMessageUuid)) throw unprocessable("Mensagem marcada inválida");
  const found = await db.message.count({ where: { conversationId, id: { in: ids } } });
  if (found !== ids.length) throw unprocessable("Mensagem marcada não pertence a esta conversa");
  return ids;
}
