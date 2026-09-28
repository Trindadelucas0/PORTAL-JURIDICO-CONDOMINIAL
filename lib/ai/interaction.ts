import type { Prisma, PrismaClient } from "@prisma/client";
import { isUniqueConflict, prismaErrorCode } from "@/lib/ai/errors";

type Db = PrismaClient | Prisma.TransactionClient;

export async function insertInteractionOnce(
  db: Db,
  data: Prisma.AiInteractionCreateInput,
): Promise<"created" | "duplicate"> {
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

export function interactionErrorCode(error: unknown): string {
  return prismaErrorCode(error);
}
