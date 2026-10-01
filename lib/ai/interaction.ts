import type { Prisma, PrismaClient } from "@prisma/client";
import { isUniqueConflict, prismaErrorCode } from "@/lib/ai/errors";

type Db = PrismaClient | Prisma.TransactionClient;

export function isJsonInvalidFailure(analysisJson: unknown, draftMessageId: string | null): boolean {
  if (draftMessageId) return false;
  if (!analysisJson || typeof analysisJson !== "object" || Array.isArray(analysisJson)) return false;
  return (analysisJson as { motivoEscalonamento?: unknown }).motivoEscalonamento === "json_invalido";
}

/** Sem rascunho gravado: o próximo Gerar resumo nas mesmas mensagens pode substituir a interação. */
export function canReplaceInteraction(draftMessageId: string | null): boolean {
  return !draftMessageId;
}

export async function insertInteractionOnce(
  db: Db,
  data: Prisma.AiInteractionCreateInput,
): Promise<"created" | "duplicate"> {
  const key = data.idempotencyKey;
  if (typeof key === "string") {
    const existing = await db.aiInteraction.findUnique({
      where: { idempotencyKey: key },
      select: { id: true },
    });
    if (existing) return "duplicate";
  }
  const inputTokens = data.inputTokens ?? 0;
  const outputTokens = data.outputTokens ?? 0;
  const per = Number(process.env.AI_COST_MICROS_PER_TOKEN ?? 0);
  const costMicros = Number.isFinite(per) ? Math.round((inputTokens + outputTokens) * per) : 0;
  try {
    await db.aiInteraction.create({ data: { ...data, costMicros } });
    return "created";
  } catch (error) {
    if (isUniqueConflict(error)) return "duplicate";
    throw error;
  }
}

/** Sem rascunho: o próximo Gerar resumo nas mesmas mensagens pode gravar de novo. Com rascunho, fica duplicate. */
export async function insertInteractionOnceReplacingJsonFailure(
  db: Db,
  data: Prisma.AiInteractionCreateInput,
): Promise<"created" | "duplicate"> {
  const key = data.idempotencyKey;
  if (typeof key === "string") {
    const existing = await db.aiInteraction.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, draftMessageId: true },
    });
    if (existing) {
      if (!canReplaceInteraction(existing.draftMessageId)) return "duplicate";
      await db.aiInteraction.delete({ where: { id: existing.id } });
    }
  }
  return insertInteractionOnce(db, data);
}

export function interactionErrorCode(error: unknown): string {
  return prismaErrorCode(error);
}
