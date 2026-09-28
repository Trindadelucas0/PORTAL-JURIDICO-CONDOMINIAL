import type { PrismaClient } from "@prisma/client";
import { unprocessable } from "@/lib/api/errors";
import { enqueueManualInbound } from "@/lib/ai/enqueue";
import { isAiEnabled } from "@/lib/ai/flags";

export async function startManualAiRun(
  db: PrismaClient,
  input: { conversationId: string; condominiumId: string | null },
): Promise<{ queued: true }> {
  if (!isAiEnabled()) throw unprocessable("A IA está desligada neste ambiente");
  if (!input.condominiumId) throw unprocessable("Vincule o condomínio antes");
  const inbound = await db.message.count({
    where: { conversationId: input.conversationId, direction: "in" },
  });
  if (inbound === 0) throw unprocessable("Não há mensagem do cliente para a IA ler");
  const result = await enqueueManualInbound(db, input.conversationId);
  if (!result.queued) throw unprocessable("Não foi possível enfileirar a IA");
  return { queued: true };
}
