import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaErrorCode } from "@/lib/ai/errors";

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

export function isManualInboundKey(key: string): boolean {
  return key.startsWith("manual:");
}

export async function insertInteractionOnce(
  db: Db,
  data: Prisma.AiInteractionUncheckedCreateInput,
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
  const inserted = await db.aiInteraction.createMany({
    data: [{ ...data, costMicros }],
    skipDuplicates: true,
  });
  return inserted.count === 1 ? "created" : "duplicate";
}

/** Sem rascunho, ou job `manual:`: o próximo Gerar resumo nas mesmas mensagens pode gravar de novo. */
export async function insertInteractionOnceReplacingJsonFailure(
  db: Db,
  data: Prisma.AiInteractionUncheckedCreateInput,
  options?: { replaceManualDraft?: boolean },
): Promise<"created" | "duplicate"> {
  const key = data.idempotencyKey;
  if (typeof key === "string") {
    const existing = await db.aiInteraction.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, draftMessageId: true, status: true, analysisJson: true },
    });
    if (existing) {
      const replaced = await deleteExistingForReplace(db, existing, Boolean(options?.replaceManualDraft));
      if (!replaced) return "duplicate";
    }
  }
  return insertInteractionOnce(db, data);
}

async function isTechnicalFailure(existing: {
  draftMessageId: string | null;
  status?: string;
  analysisJson?: unknown;
}): Promise<boolean> {
  if (isJsonInvalidFailure(existing.analysisJson, null)) return true;
  return existing.status === "abstained" || existing.status === "failed";
}

async function deleteExistingForReplace(
  db: Db,
  existing: { id: string; draftMessageId: string | null; status?: string; analysisJson?: unknown },
  replaceManualDraft: boolean,
): Promise<boolean> {
  const technical = await isTechnicalFailure(existing);
  if (!replaceManualDraft && !canReplaceInteraction(existing.draftMessageId) && !technical) return false;
  if (existing.draftMessageId) {
    const message = await db.message.findUnique({
      where: { id: existing.draftMessageId },
      select: { id: true, sendStatus: true },
    });
    if (message?.sendStatus === "sent" && !replaceManualDraft) return false;
    await db.aiInteraction.update({
      where: { id: existing.id },
      data: { draftMessageId: null },
    });
    if (message?.sendStatus === "draft") {
      await db.message.delete({ where: { id: message.id } });
    }
  }
  await db.aiInteraction.delete({ where: { id: existing.id } });
  return true;
}

export function interactionErrorCode(error: unknown): string {
  return prismaErrorCode(error);
}
