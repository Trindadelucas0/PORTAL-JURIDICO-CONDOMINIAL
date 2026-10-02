import type { PrismaClient, User } from "@prisma/client";
import { forbidden, unprocessable } from "@/lib/api/errors";
import {
  enqueueManualInbound,
  isMessageUuid,
  payloadMessageIds,
  payloadRelatoMessageIds,
} from "@/lib/ai/enqueue";
import { isAiEnabled } from "@/lib/ai/flags";
import { SELECTED_MESSAGE_LIMIT } from "@/lib/ai/package";
import { approvalService } from "@/lib/services/approval-service";
import { canSendPublicWhatsApp } from "@/lib/services/whatsapp-dispatch";

type RejectFn = (user: User, messageId: string) => Promise<unknown>;

type ManualRunInput = {
  conversationId: string;
  condominiumId: string | null;
  messageIds?: string[];
  relatoMessageIds?: string[];
  rejectedDraft?: string | null;
};

export async function startManualAiRun(db: PrismaClient, input: ManualRunInput): Promise<{ queued: true }> {
  if (!isAiEnabled()) throw unprocessable("A IA está desligada neste ambiente");
  if (!input.condominiumId) throw unprocessable("Vincule o condomínio antes");
  if (input.relatoMessageIds) {
    const relato = await assertRelatoMessages(db, input.conversationId, input.relatoMessageIds);
    const marks = input.messageIds?.length
      ? await assertSelectedMessages(db, input.conversationId, input.messageIds)
      : [];
    if (relato.length === 0 && marks.length === 0) {
      throw unprocessable("Marque mensagens ou abra uma conversa com mensagens não abertas");
    }
    return enqueueOrFail(db, input.conversationId, marks, relato, input.rejectedDraft);
  }
  const selected = input.messageIds
    ? await assertSelectedMessages(db, input.conversationId, input.messageIds)
    : undefined;
  if (!selected) {
    const inbound = await db.message.count({
      where: { conversationId: input.conversationId, direction: "in" },
    });
    if (inbound === 0) throw unprocessable("Não há mensagem do cliente para a IA ler");
  }
  return enqueueOrFail(db, input.conversationId, selected, undefined, input.rejectedDraft);
}

export async function startRejectedSummaryRun(
  db: PrismaClient,
  user: User,
  input: { conversationId: string; condominiumId: string | null; version: number },
  reject: RejectFn = (actor, messageId) => approvalService.reject(actor, messageId),
): Promise<{ queued: true }> {
  if (!canSendPublicWhatsApp(user)) throw forbidden("Este perfil não pode responder o cliente");
  const memory = await db.aiTicketMemory.findUnique({
    where: { conversationId: input.conversationId },
    select: { version: true },
  });
  const currentVersion = memory?.version && memory.version > 0 ? memory.version : null;
  if (currentVersion !== input.version) throw unprocessable("Só a versão atual pode gerar outro resumo");
  const revision = await db.aiTicketMemoryRevision.findFirst({
    where: { conversationId: input.conversationId, version: input.version },
    select: {
      summaryJson: true,
      interaction: { select: { draftMessage: { select: { id: true, body: true, sendStatus: true } } } },
    },
  });
  if (!revision) throw unprocessable("Versão não encontrada");
  const summary = asRecord(revision.summaryJson);
  const stored = typeof summary.respostaSugerida === "string" ? summary.respostaSugerida.trim() : "";
  const draft = revision.interaction?.draftMessage ?? null;
  const texto = stored || draft?.body.trim() || "";
  if (!texto) throw unprocessable("Nenhum rascunho para gerar de novo");
  if (draft && draft.sendStatus === "draft") {
    await reject(user, draft.id);
  }
  const jobs = await db.aiJob.findMany({
    where: { conversationId: input.conversationId, type: "ai.inbound" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { payload: true },
  });
  const last = jobs.find((job) => payloadRelatoMessageIds(job.payload) !== null || payloadMessageIds(job.payload));
  const relatoMessageIds = last ? payloadRelatoMessageIds(last.payload) : null;
  const messageIds = last ? payloadMessageIds(last.payload) : null;
  if (!relatoMessageIds && !messageIds?.length) throw unprocessable("Não foi possível enfileirar a IA");
  return startManualAiRun(db, {
    conversationId: input.conversationId,
    condominiumId: input.condominiumId,
    messageIds: messageIds ?? (relatoMessageIds ? [] : undefined),
    relatoMessageIds: relatoMessageIds ?? undefined,
    rejectedDraft: texto,
  });
}

async function enqueueOrFail(
  db: PrismaClient,
  conversationId: string,
  messageIds?: string[],
  relatoMessageIds?: string[],
  rejectedDraft?: string | null,
): Promise<{ queued: true }> {
  const result = await enqueueManualInbound(db, conversationId, messageIds, relatoMessageIds, rejectedDraft);
  if (!result.queued) throw unprocessable("Não foi possível enfileirar a IA");
  return { queued: true };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
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

/** 0 a 40 ids, todos `Message` `direction=in` desta conversa. */
async function assertRelatoMessages(db: PrismaClient, conversationId: string, messageIds: string[]): Promise<string[]> {
  const ids = [...new Set(messageIds)];
  if (ids.length === 0) return [];
  if (ids.length > SELECTED_MESSAGE_LIMIT) {
    throw unprocessable(`Marque no máximo ${SELECTED_MESSAGE_LIMIT} mensagens`);
  }
  if (!ids.every(isMessageUuid)) throw unprocessable("Mensagem marcada inválida");
  const found = await db.message.count({ where: { conversationId, direction: "in", id: { in: ids } } });
  if (found !== ids.length) throw unprocessable("Mensagem marcada não pertence a esta conversa");
  return ids;
}
