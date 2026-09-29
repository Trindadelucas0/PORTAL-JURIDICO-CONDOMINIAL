import type { Prisma, PrismaClient } from "@prisma/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { isUniqueConflict, prismaErrorCode } from "@/lib/ai/errors";
import { SELECTED_MESSAGE_LIMIT } from "@/lib/ai/package";
import { INBOUND_DEBOUNCE_MS, wakeInbound } from "@/lib/ai/queue";

type Db = PrismaClient | Prisma.TransactionClient;

export function shouldEnqueueInbound(input: {
  created: boolean;
  inOperationalFlow: boolean;
  condominiumId: string | null;
}): boolean {
  return Boolean(input.created && input.inOperationalFlow && input.condominiumId && isAiEnabled());
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
  try {
    await db.aiJob.create({
      data: {
        type: "ai.inbound",
        idempotencyKey: input.messageId,
        conversationId: input.conversationId,
        status: "queued",
        runAfter: new Date(Date.now() + INBOUND_DEBOUNCE_MS),
      },
    });
  } catch (error) {
    if (isUniqueConflict(error)) return { queued: false };
    console.error(`[ai] job insert errorCode=${prismaErrorCode(error)}`);
    return { queued: false };
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

export async function enqueueManualInbound(
  db: Db,
  conversationId: string,
  messageIds?: string[],
): Promise<{ queued: boolean }> {
  if (!isAiEnabled()) return { queued: false };
  try {
    await db.aiJob.create({
      data: {
        type: "ai.inbound",
        idempotencyKey: `manual:${conversationId}:${Date.now()}`,
        conversationId,
        status: "queued",
        runAfter: new Date(),
        ...(messageIds?.length ? { payload: { messageIds } } : {}),
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
