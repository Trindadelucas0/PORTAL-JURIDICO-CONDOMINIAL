import type { Prisma, PrismaClient } from "@prisma/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { isUniqueConflict, prismaErrorCode } from "@/lib/ai/errors";
import { REJECTED_DRAFT_CHAR_LIMIT, SELECTED_MESSAGE_LIMIT } from "@/lib/ai/package";
import { inboundKeysToShift } from "@/lib/ai/intake-cycle";
import { inboundDebounceMs, wakeInbound } from "@/lib/ai/queue";

type Db = PrismaClient | Prisma.TransactionClient;

export function shouldEnqueueInbound(input: {
  created: boolean;
  inOperationalFlow: boolean;
  condominiumId: string | null;
}): boolean {
  return Boolean(input.created && input.inOperationalFlow && input.condominiumId && isAiEnabled());
}

/**
 * Entradas até a triagem que nunca viraram job.
 * Mensagem posterior à triagem e job já existente (qualquer status) ficam de fora.
 */
export function inboundIdsMissingJob(input: {
  inbound: Array<{ id: string; createdAt: Date }>;
  triageCreatedAt: Date | null;
  existingJobKeys: ReadonlySet<string>;
  limit?: number;
}): string[] {
  if (!input.triageCreatedAt) return [];
  const until = input.triageCreatedAt.getTime();
  const limit = input.limit ?? SELECTED_MESSAGE_LIMIT;
  return input.inbound
    .filter((row) => row.createdAt.getTime() <= until && !input.existingJobKeys.has(row.id))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((row) => row.id);
}

/** Depois do vínculo, enfileira o que chegou antes da triagem. Não propaga erro. */
export async function enqueueInboundMissedOnLink(db: Db, conversationId: string): Promise<void> {
  try {
    if (!isAiEnabled()) return;
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: {
        condominiumId: true,
        contact: { select: { condominiumId: true } },
      },
    });
    if (!conversation?.condominiumId || !conversation.contact?.condominiumId) return;
    const triage = await db.triageItem.findUnique({
      where: { conversationId },
      select: { createdAt: true },
    });
    if (!triage) return;
    const inbound = await db.message.findMany({
      where: { conversationId, direction: "in", createdAt: { lte: triage.createdAt } },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: SELECTED_MESSAGE_LIMIT,
    });
    if (inbound.length === 0) return;
    const jobs = await db.aiJob.findMany({
      where: { idempotencyKey: { in: inbound.map((row) => row.id) } },
      select: { idempotencyKey: true },
    });
    const ids = inboundIdsMissingJob({
      inbound,
      triageCreatedAt: triage.createdAt,
      existingJobKeys: new Set(jobs.map((job) => job.idempotencyKey)),
    });
    for (const messageId of ids) {
      await enqueueInboundJob(db, {
        conversationId,
        messageId,
        created: true,
        inOperationalFlow: true,
        condominiumId: conversation.condominiumId,
      });
    }
  } catch (error) {
    console.error("[ai] fila após vínculo", error instanceof Error ? error.message : "erro");
  }
}

export async function enqueueInboundJob(
  db: Db,
  input: {
    created: boolean;
    inOperationalFlow: boolean;
    condominiumId: string | null;
    messageId: string;
    conversationId: string;
  },
): Promise<{ queued: boolean }> {
  if (!shouldEnqueueInbound(input)) return { queued: false };
  const runAfter = new Date(Date.now() + inboundDebounceMs());
  try {
    await db.aiJob.create({
      data: {
        type: "ai.inbound",
        idempotencyKey: input.messageId,
        conversationId: input.conversationId,
        status: "queued",
        runAfter,
      },
    });
  } catch (error) {
    if (isUniqueConflict(error)) return { queued: false };
    console.error(`[ai] job insert errorCode=${prismaErrorCode(error)}`);
    return { queued: false };
  }
  try {
    const queued = await db.aiJob.findMany({
      where: { conversationId: input.conversationId, type: "ai.inbound", status: "queued" },
      select: { id: true, idempotencyKey: true },
    });
    const shift = new Set(inboundKeysToShift(queued.map((job) => job.idempotencyKey), isMessageUuid));
    const ids = queued.filter((job) => shift.has(job.idempotencyKey)).map((job) => job.id);
    if (ids.length) {
      await db.aiJob.updateMany({
        where: { id: { in: ids } },
        data: { runAfter },
      });
    }
  } catch {
    console.error("[ai] debounce shift errorCode=DEBOUNCE");
  }
  try {
    const wake = await wakeInbound(input.conversationId);
    if (wake.duplicated) {
      await db.aiJob.updateMany({
        where: { conversationId: input.conversationId, status: "queued" },
        data: { rerun: true },
      });
    }
  } catch {
    console.error("[ai] enqueue errorCode=REDIS");
  }
  return { queued: true };
}

const MESSAGE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMessageUuid(value: string): boolean {
  return MESSAGE_UUID.test(value);
}

/** Job disparado na tela. A chave não é id de Message. */
export function jobKeysNeedLatestInbound(keys: string[]): boolean {
  return keys.length === 0 || keys.every((key) => !isMessageUuid(key));
}

/** Ids marcados no Atendimento, lidos do `AiJob.payload`. Payload nulo ou inválido = sem seleção. */
export function payloadMessageIds(payload: unknown): string[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = (payload as { messageIds?: unknown }).messageIds;
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && isMessageUuid(id)))];
  if (!ids.length) return null;
  return ids.slice(0, SELECTED_MESSAGE_LIMIT);
}

/**
 * Não abertas que o Atendimento mandou para o relato. `null` = chave ausente (ficha, automático, job antigo);
 * array, mesmo vazio, = job com relato separado das marcas.
 */
export function payloadRelatoMessageIds(payload: unknown): string[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = (payload as { relatoMessageIds?: unknown }).relatoMessageIds;
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && isMessageUuid(id)))];
  return ids.slice(0, SELECTED_MESSAGE_LIMIT);
}

export function payloadRejectedDraft(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = (payload as { rejectedDraft?: unknown }).rejectedDraft;
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, REJECTED_DRAFT_CHAR_LIMIT);
  return text || null;
}

export function rejectedDraftForJobs(jobs: Array<{ payload: unknown }>): string | null {
  for (let index = jobs.length - 1; index >= 0; index--) {
    const text = payloadRejectedDraft(jobs[index].payload);
    if (text) return text;
  }
  return null;
}

function clipRejectedDraft(value?: string | null): string {
  return value?.replace(/\s+/g, " ").trim().slice(0, REJECTED_DRAFT_CHAR_LIMIT) || "";
}

function manualPayload(
  messageIds?: string[],
  relatoMessageIds?: string[],
  rejectedDraft?: string | null,
): Prisma.InputJsonValue | undefined {
  const draft = clipRejectedDraft(rejectedDraft);
  if (relatoMessageIds) {
    return draft
      ? { messageIds: messageIds ?? [], relatoMessageIds, rejectedDraft: draft }
      : { messageIds: messageIds ?? [], relatoMessageIds };
  }
  if (messageIds?.length) {
    return draft ? { messageIds, rejectedDraft: draft } : { messageIds };
  }
  if (draft) return { rejectedDraft: draft };
  return undefined;
}

export async function enqueueManualInbound(
  db: Db,
  conversationId: string,
  messageIds?: string[],
  relatoMessageIds?: string[],
  rejectedDraft?: string | null,
): Promise<{ queued: boolean }> {
  if (!isAiEnabled()) return { queued: false };
  const payload = manualPayload(messageIds, relatoMessageIds, rejectedDraft);
  try {
    await db.aiJob.create({
      data: {
        type: "ai.inbound",
        idempotencyKey: `manual:${conversationId}:${Date.now()}`,
        conversationId,
        status: "queued",
        runAfter: new Date(),
        ...(payload ? { payload } : {}),
      },
    });
  } catch (error) {
    if (isUniqueConflict(error)) return { queued: false };
    console.error(`[ai] manual job errorCode=${prismaErrorCode(error)}`);
    return { queued: false };
  }
  try {
    await wakeInbound(conversationId);
  } catch {
    console.error("[ai] enqueue errorCode=REDIS");
  }
  return { queued: true };
}

export async function enqueueMediaDownloadJob(
  db: Db,
  input: { waMessageId: string; conversationId: string },
): Promise<{ queued: boolean }> {
  try {
    await db.aiJob.create({
      data: {
        type: "ai.media.download",
        idempotencyKey: `media:${input.waMessageId}`,
        conversationId: input.conversationId,
        status: "queued",
      },
    });
    return { queued: true };
  } catch (error) {
    if (isUniqueConflict(error)) return { queued: false };
    console.error(`[ai] media job errorCode=${prismaErrorCode(error)}`);
    return { queued: false };
  }
}
