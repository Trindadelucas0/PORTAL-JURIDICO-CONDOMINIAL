import type { Prisma, PrismaClient } from "@prisma/client";
import { isUniqueConflict } from "@/lib/ai/errors";
import { extractPdfText } from "@/lib/ai/extract-pdf";
import {
  IMAGE_HANDOFF_TEXT,
  INTAKE_NUDGE_TEXT,
  MEDIA_WAIT_MS,
  UNCLEAR_ESCALATE_TEXT,
  comSaudacao,
  coagirAskSemDecision,
  decidir,
  decidirTimeout,
  imagemNoMeio,
  intakeContextChanged,
  intakeSessionOpen,
  intakeTimeoutKey,
  intakeWaitMs,
  mergeIntakeContext,
  parseIntakeContext,
  parseIntakeTimeoutPayload,
  patchTriagemAberta,
  saudacaoPorMinuto,
  sessionCountsForTurn,
  shouldDeferAskForMedia,
  type IntakeAnexo,
  type IntakeContext,
  type IntakePlan,
} from "@/lib/ai/intake-cycle";
import { succeedIntakeTimeouts, writeIntakeAudit } from "@/lib/ai/intake-close";
import { isAiWhatsappSendEnabled } from "@/lib/ai/flags";
import { avaliarRespostaPublica } from "@/lib/ai/public-reply-guard";
import { deliverStoredPublicMessage } from "@/lib/services/whatsapp-dispatch";
import { businessMinutes } from "@/lib/time/business-clock";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { ticketService } from "@/lib/services/ticket-service";

const OPEN = ["collecting", "waiting_client", "processing"] as const;

/** Desfecho de uma frase da coleta: enviada, guardada como rascunho para aprovacao, ou falha. */
type AutomatedOutcome = "sent" | "draft" | "failed";

export type PreparedIntake = {
  plan: IntakePlan;
  conversationId: string;
  ticketId: string | null;
  confirmedFacts: string[];
  missingInformation: string[];
  problema: string;
  proximaAcao: string;
  anexos: IntakeAnexo[];
  triageCategory: string | null;
  triagePriority: string | null;
};

type SessionRow = {
  id: string;
  conversationId: string;
  status: string;
  questionCount: number;
  nudgeSent: boolean;
  unclearCount: number;
  startedAt: Date;
  lastQuestionMessageId: string | null;
  lastQuestionAt: Date | null;
  contextJson: Prisma.JsonValue | null;
};

function asContext(value: IntakeContext): Prisma.InputJsonValue {
  return {
    problema: value.problema,
    confirmado: value.confirmado,
    falta: value.falta,
    proximaAcao: value.proximaAcao,
    anexos: value.anexos.map((item) => (item.texto ? { nome: item.nome, texto: item.texto } : { nome: item.nome })),
  };
}

async function latestSession(db: PrismaClient, conversationId: string): Promise<SessionRow | null> {
  return db.aiIntakeSession.findFirst({
    where: { conversationId },
    orderBy: { startedAt: "desc" },
  });
}

async function openOrCreate(db: PrismaClient, conversationId: string): Promise<SessionRow> {
  const existing = await db.aiIntakeSession.findFirst({
    where: { conversationId, status: { in: [...OPEN] } },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;
  try {
    const created = await db.aiIntakeSession.create({
      data: { conversationId, status: "collecting" },
    });
    await writeIntakeAudit(db, { action: "AI_INTAKE_STARTED", conversationId, result: "started" });
    return created;
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const again = await db.aiIntakeSession.findFirst({
      where: { conversationId, status: { in: [...OPEN] } },
      orderBy: { startedAt: "desc" },
    });
    if (again) return again;
    throw error;
  }
}

/**
 * Contrato v14, clausula 16.1 e Anexo I item 3: a frase da coleta so vai ao WhatsApp
 * depois da aprovacao da admin. Com `isAiWhatsappSendEnabled()` falso (sempre, hoje)
 * a mensagem publica fica `draft` e quem despacha e `approvalService.approve`,
 * que exige `isAdmin`. Nada sai sozinho.
 */
async function sendAutomated(
  db: PrismaClient,
  input: { conversationId: string; ticketId: string | null; body: string },
): Promise<{ id: string; outcome: AutomatedOutcome }> {
  const autoSend = isAiWhatsappSendEnabled();
  const message = await db.message.create({
    data: {
      conversationId: input.conversationId,
      ticketId: input.ticketId,
      direction: "out",
      visibility: "publica",
      automated: true,
      sendStatus: autoSend ? "pending" : "draft",
      body: input.body.slice(0, 800),
    },
  });
  if (!autoSend) return { id: message.id, outcome: "draft" };
  try {
    await deliverStoredPublicMessage(db, message.id);
  } catch {
    return { id: message.id, outcome: "failed" };
  }
  const row = await db.message.findUnique({ where: { id: message.id }, select: { sendStatus: true } });
  return { id: message.id, outcome: row?.sendStatus === "sent" ? "sent" : "failed" };
}

async function saveContext(db: PrismaClient, session: SessionRow, patch: Partial<IntakeContext>, ticketId: string | null) {
  const next = mergeIntakeContext(session.contextJson, patch);
  if (!intakeContextChanged(session.contextJson, next)) return next;
  await db.aiIntakeSession.update({
    where: { id: session.id },
    data: { contextJson: asContext(next) },
  });
  await writeIntakeAudit(db, {
    action: "AI_CONTEXT_UPDATED",
    conversationId: session.conversationId,
    ticketId,
    result: "updated",
  });
  return next;
}

async function enqueueTimeout(db: PrismaClient, sessionId: string, questionCount: number, conversationId: string) {
  try {
    await db.aiJob.create({
      data: {
        type: "ai.intake.timeout",
        idempotencyKey: intakeTimeoutKey(sessionId, questionCount),
        conversationId,
        status: "queued",
        runAfter: new Date(Date.now() + intakeWaitMs()),
        payload: { sessionId, questionCount },
      },
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }
}

async function markStatus(
  db: PrismaClient,
  sessionId: string,
  status: "waiting_client" | "ready_for_human" | "human_review",
  conversationId: string,
  ticketId: string | null,
) {
  await db.aiIntakeSession.update({
    where: { id: sessionId },
    data: {
      status,
      completedAt: status === "waiting_client" ? null : new Date(),
      closeReason: status === "human_review" ? "revisao" : status === "ready_for_human" ? "completa" : null,
    },
  });
  if (status !== "waiting_client") await succeedIntakeTimeouts(db, sessionId);
  if (status === "ready_for_human") {
    await writeIntakeAudit(db, { action: "AI_INTAKE_COMPLETED", conversationId, ticketId, result: "ready_for_human" });
  }
  if (status === "human_review") {
    await writeIntakeAudit(db, { action: "AI_HUMAN_REVIEW_REQUIRED", conversationId, ticketId, result: "human_review" });
  }
}

function mediaKind(mime: string, name: string): "pdf" | "imagem" | "audio" | null {
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export async function holdInboundForMedia(
  db: PrismaClient,
  input: { conversationId: string; jobIds: string[]; messageIds: string[]; attempts: number },
): Promise<boolean> {
  if (!input.jobIds.length || !input.messageIds.length) return false;
  const messages = await db.message.findMany({
    where: { id: { in: input.messageIds } },
    select: { waMessageId: true },
  });
  const keys = messages.flatMap((row) => (row.waMessageId ? [`media:${row.waMessageId}`] : []));
  if (!keys.length) return false;
  const pending = await db.aiJob.count({
    where: { type: "ai.media.download", status: { in: ["queued", "running"] }, idempotencyKey: { in: keys } },
  });
  if (!shouldDeferAskForMedia({ pendingMediaJobs: pending, attempts: input.attempts })) return false;
  await db.aiJob.updateMany({
    where: { id: { in: input.jobIds }, type: "ai.inbound" },
    data: {
      status: "queued",
      lockedAt: null,
      lastErrorCode: "MEDIA_WAIT",
      runAfter: new Date(Date.now() + MEDIA_WAIT_MS),
    },
  });
  return true;
}

/** PDF sem chamado entra no contexto. PDF com chamado segue o índice do download. Imagem e áudio: só o nome. */
export async function loadIntakePackageContext(
  db: PrismaClient,
  conversationId: string,
  messageIds: string[],
): Promise<IntakeContext | null> {
  const session = await latestSession(db, conversationId);
  const base = parseIntakeContext(session?.contextJson);
  if (!messageIds.length) return contextOrNull(base);
  const messages = await db.message.findMany({
    where: { id: { in: messageIds } },
    select: {
      ticketId: true,
      attachments: { select: { mime: true, originalName: true, storageKey: true } },
    },
  });
  const anexos: IntakeAnexo[] = [];
  for (const message of messages) {
    for (const file of message.attachments) {
      const kind = mediaKind(file.mime, file.originalName);
      if (!kind) continue;
      if (kind === "pdf" && message.ticketId) continue;
      if (kind === "pdf") {
        try {
          const stored = await localDiskStorage.read(file.storageKey);
          const text = (await extractPdfText(stored.buffer)).slice(0, 8000);
          anexos.push(text ? { nome: file.originalName.slice(0, 180), texto: text } : { nome: file.originalName.slice(0, 180) });
        } catch {
          anexos.push({ nome: file.originalName.slice(0, 180) });
        }
        continue;
      }
      anexos.push({ nome: file.originalName.slice(0, 180) });
    }
  }
  const merged = mergeIntakeContext(base, anexos.length ? { anexos } : {});
  return contextOrNull(merged);
}

function contextOrNull(value: IntakeContext): IntakeContext | null {
  if (!value.problema && !value.proximaAcao && !value.confirmado.length && !value.falta.length && !value.anexos.length) return null;
  return value;
}

async function turnoTemImagemNoMeio(db: PrismaClient, conversationId: string, messageIds: string[]): Promise<boolean> {
  if (!messageIds.length) return false;
  const current = await db.message.findMany({
    where: { id: { in: messageIds }, conversationId },
    select: {
      createdAt: true,
      attachments: { select: { mime: true, originalName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const images = current.filter((row) =>
    row.attachments.some((file) => mediaKind(file.mime, file.originalName) === "imagem"),
  );
  const firstImageAt = images[0]?.createdAt;
  if (!firstImageAt) return false;
  const before = await db.message.findFirst({
    where: { conversationId, createdAt: { lt: firstImageAt } },
    select: { id: true },
  });
  return imagemNoMeio({ temImagem: true, houveMensagemAntes: Boolean(before) });
}

function comCumprimento(text: string | null, jaFalou: boolean): string | null {
  if (!text) return text;
  return comSaudacao(text, saudacaoPorMinuto(businessMinutes(new Date())), jaFalou).slice(0, 800);
}

export async function prepareIntakeTurn(
  db: PrismaClient,
  input: {
    conversationId: string;
    ticketId: string | null;
    manual: boolean;
    hasCondominium: boolean;
    messageIds: string[];
    batchStartedAt: Date;
    modelDecision: "ASK" | "COMPLETE" | "HUMAN_REVIEW" | "UNCLEAR" | null;
    question: string | null;
    confirmedFacts: string[];
    missingInformation: string[];
    mensagemCliente: string;
    riskHigh: boolean;
    injection: boolean;
    jsonInvalid: boolean;
    problema: string;
    proximaAcao: string;
    anexos: IntakeAnexo[];
    clientDraft?: string | null;
    triageCategory?: string | null;
    triagePriority?: string | null;
  },
): Promise<PreparedIntake> {
  const session = input.manual || !input.hasCondominium ? null : await latestSession(db, input.conversationId);
  const openTicket =
    input.manual || !input.hasCondominium
      ? null
      : await db.ticket.findFirst({
          where: { conversationId: input.conversationId, status: { not: "resolvido" } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
  const counts = sessionCountsForTurn({
    session: session
      ? {
          status: session.status,
          questionCount: session.questionCount,
          unclearCount: session.unclearCount,
          startedAt: session.startedAt,
        }
      : null,
    openTicketCreatedAt: openTicket?.createdAt ?? null,
  });
  const [greeting, human] = await Promise.all([
    input.messageIds.length
      ? db.automationExecution.findFirst({
          where: { inboundMessageId: { in: input.messageIds }, status: "sent" },
          select: { id: true },
        })
      : Promise.resolve(null),
    db.message.findFirst({
      where: {
        conversationId: input.conversationId,
        direction: "out",
        visibility: "publica",
        automated: false,
        sendStatus: "sent",
        createdAt: { gt: input.batchStartedAt },
      },
      select: { id: true },
    }),
  ]);
  const coerced = coagirAskSemDecision({
    modelDecision: input.modelDecision,
    clientDraft: input.clientDraft ?? null,
    question: input.question,
    mensagemCliente: input.mensagemCliente,
  });
  const answer = coerced.modelDecision === "ASK" ? null : (input.clientDraft ?? null);
  const verdict = avaliarRespostaPublica({
    draft: coerced.modelDecision === "ASK" ? coerced.question : answer,
    mensagemCliente: input.mensagemCliente,
  });
  let plan = decidir({
    manual: input.manual,
    hasCondominium: input.hasCondominium,
    sessionStatus: counts.sessionStatus,
    questionCount: counts.questionCount,
    unclearCount: counts.unclearCount,
    modelDecision: coerced.modelDecision,
    question: coerced.question,
    answer,
    publicReplyStatus: verdict.status,
    riskHigh: input.riskHigh,
    injection: input.injection,
    jsonInvalid: input.jsonInvalid,
    greetingSentThisInbound: Boolean(greeting),
    humanPublicAfterBatchStart: Boolean(human),
  });
  const imageMid =
    !input.manual &&
    input.hasCondominium &&
    counts.sessionStatus !== "interrupted" &&
    !human &&
    (await turnoTemImagemNoMeio(db, input.conversationId, input.messageIds));
  if (imageMid) {
    plan = {
      kind: "image_handoff",
      sendWhatsapp: true,
      text: IMAGE_HANDOFF_TEXT,
      suppressDraft: true,
      incrementQuestion: false,
      nextStatus: "human_review",
      startSession: true,
    };
  }
  if (plan.sendWhatsapp && plan.text) {
    const since = intakeSessionOpen(session?.status) ? session?.startedAt : openTicket?.createdAt;
    const spoken = counts.questionCount > 0 || Boolean(greeting)
      ? { id: "already" }
      : since
        ? await db.message.findFirst({
            where: {
              conversationId: input.conversationId,
              direction: "out",
              automated: true,
              visibility: "publica",
              sendStatus: { in: ["sent", "draft"] },
              createdAt: { gte: since },
            },
            select: { id: true },
          })
        : null;
    plan = { ...plan, text: comCumprimento(plan.text, Boolean(spoken)) };
  }
  return {
    plan,
    conversationId: input.conversationId,
    ticketId: input.ticketId,
    confirmedFacts: input.confirmedFacts,
    missingInformation: input.missingInformation,
    problema: input.problema,
    proximaAcao: input.proximaAcao,
    anexos: input.anexos,
    triageCategory: input.triageCategory ?? null,
    triagePriority: input.triagePriority ?? null,
  };
}

async function gravarDiagnosticoTriagem(db: PrismaClient, prepared: PreparedIntake) {
  if (!prepared.triageCategory && !prepared.triagePriority) return;
  const triage = await db.triageItem.findUnique({
    where: { conversationId: prepared.conversationId },
    select: { id: true, status: true },
  });
  if (!triage) return;
  const patch = patchTriagemAberta({
    status: triage.status,
    category: prepared.triageCategory,
    priority: prepared.triagePriority,
  });
  if (!patch) return;
  await db.triageItem.update({ where: { id: triage.id }, data: patch });
}

export async function commitIntakeTurn(db: PrismaClient, prepared: PreparedIntake) {
  await gravarDiagnosticoTriagem(db, prepared);
  const { plan } = prepared;
  if (!plan.startSession || !plan.nextStatus) return;
  const session = await openOrCreate(db, prepared.conversationId);
  await saveContext(db, session, {
    problema: prepared.problema,
    confirmado: prepared.confirmedFacts,
    falta: prepared.missingInformation,
    proximaAcao: prepared.proximaAcao,
    anexos: prepared.anexos,
  }, prepared.ticketId);

  if (plan.kind === "image_handoff" && plan.text) {
    await sendImageHandoff(db, session, prepared.ticketId, plan.text);
    return;
  }
  if (plan.kind === "ask" && plan.text) {
    await sendQuestion(db, session, prepared.ticketId, plan.text);
    return;
  }
  if (plan.kind === "answer" && plan.text) {
    await sendAnswer(db, session, prepared.ticketId, plan.text);
    return;
  }
  if (plan.kind === "unclear_repeat" && plan.text) {
    await sendUnclearRepeat(db, session, prepared.ticketId, plan.text);
    return;
  }
  if (plan.kind === "unclear_escalate" && plan.text) {
    await sendUnclearEscalate(db, session, prepared.ticketId, plan.text);
    return;
  }
  if (plan.nextStatus === "ready_for_human" || plan.nextStatus === "human_review") {
    await markStatus(db, session.id, plan.nextStatus, prepared.conversationId, prepared.ticketId);
  }
}

async function sendImageHandoff(db: PrismaClient, session: SessionRow, ticketId: string | null, text: string) {
  const already = await db.message.findFirst({
    where: {
      conversationId: session.conversationId,
      direction: "out",
      automated: true,
      sendStatus: { in: ["sent", "draft"] },
      body: { contains: IMAGE_HANDOFF_TEXT },
    },
    select: { id: true },
  });
  if (already) {
    await db.aiIntakeSession.updateMany({
      where: { id: session.id, status: { in: [...OPEN] } },
      data: { status: "interrupted", closeReason: "imagem", completedAt: new Date() },
    });
    await succeedIntakeTimeouts(db, session.id);
    return;
  }
  const claimed = await db.aiIntakeSession.updateMany({
    where: { id: session.id, status: { in: [...OPEN] } },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) return;
  const sent = await sendAutomated(db, { conversationId: session.conversationId, ticketId, body: text });
  if (sent.outcome === "failed") {
    await db.aiIntakeSession.update({
      where: { id: session.id },
      data: { status: session.questionCount > 0 ? "waiting_client" : "collecting" },
    });
    return;
  }
  try {
    await ticketService.applyImagePriority(session.conversationId);
  } catch (error) {
    console.error("[ai] prioridade da imagem", error instanceof Error ? error.message : "erro");
  }
  await db.aiIntakeSession.update({
    where: { id: session.id },
    data: { status: "interrupted", closeReason: "imagem", completedAt: new Date() },
  });
  await succeedIntakeTimeouts(db, session.id);
  await writeIntakeAudit(db, {
    action: "AI_INTAKE_INTERRUPTED",
    conversationId: session.conversationId,
    ticketId,
    result: "imagem",
  });
}

async function sendQuestion(db: PrismaClient, session: SessionRow, ticketId: string | null, text: string) {
  const already = await db.message.findFirst({
    where: {
      conversationId: session.conversationId,
      direction: "out",
      automated: true,
      sendStatus: { in: ["sent", "draft"] },
      body: text,
      ...(session.lastQuestionAt ? { createdAt: { gt: session.lastQuestionAt } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (already && session.lastQuestionMessageId === already.id) return;
  if (already && session.lastQuestionMessageId !== already.id) {
    const bumped = await db.aiIntakeSession.updateMany({
      where: { id: session.id, questionCount: session.questionCount },
      data: {
        questionCount: { increment: 1 },
        lastQuestionMessageId: already.id,
        lastQuestionAt: new Date(),
        status: "waiting_client",
        nudgeSent: false,
      },
    });
    if (bumped.count === 1) {
      await enqueueTimeout(db, session.id, session.questionCount + 1, session.conversationId);
      await writeIntakeAudit(db, {
        action: "AI_QUESTION_SENT",
        conversationId: session.conversationId,
        ticketId,
        result: "already",
      });
    }
    return;
  }
  const claimed = await db.aiIntakeSession.updateMany({
    where: { id: session.id, status: { in: [...OPEN] }, questionCount: session.questionCount },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) return;
  const sent = await sendAutomated(db, { conversationId: session.conversationId, ticketId, body: text });
  if (sent.outcome === "failed") {
    await db.aiIntakeSession.update({
      where: { id: session.id },
      data: { status: session.questionCount > 0 ? "waiting_client" : "collecting" },
    });
    return;
  }
  const incremented = await db.aiIntakeSession.updateMany({
    where: { id: session.id, questionCount: session.questionCount },
    data: {
      questionCount: { increment: 1 },
      lastQuestionMessageId: sent.id,
      lastQuestionAt: new Date(),
      status: "waiting_client",
      nudgeSent: false,
    },
  });
  if (incremented.count !== 1) return;
  await enqueueTimeout(db, session.id, session.questionCount + 1, session.conversationId);
  await writeIntakeAudit(db, {
    action: "AI_QUESTION_SENT",
    conversationId: session.conversationId,
    ticketId,
    result: sent.outcome,
  });
}

async function sendAnswer(db: PrismaClient, session: SessionRow, ticketId: string | null, text: string) {
  const already = await db.message.findFirst({
    where: {
      conversationId: session.conversationId,
      direction: "out",
      automated: true,
      sendStatus: { in: ["sent", "draft"] },
      body: text,
      ...(session.lastQuestionAt ? { createdAt: { gt: session.lastQuestionAt } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (already) {
    await db.aiIntakeSession.updateMany({
      where: { id: session.id, status: { in: [...OPEN] } },
      data: { status: "waiting_client", nudgeSent: false },
    });
    return;
  }
  const claimed = await db.aiIntakeSession.updateMany({
    where: { id: session.id, status: { in: [...OPEN] } },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) return;
  const sent = await sendAutomated(db, { conversationId: session.conversationId, ticketId, body: text });
  if (sent.outcome === "failed") {
    await db.aiIntakeSession.update({
      where: { id: session.id },
      data: { status: session.questionCount > 0 ? "waiting_client" : "collecting" },
    });
    return;
  }
  await db.aiIntakeSession.updateMany({
    where: { id: session.id, status: "processing" },
    data: { status: "waiting_client", nudgeSent: false },
  });
}

async function sendUnclearRepeat(db: PrismaClient, session: SessionRow, ticketId: string | null, text: string) {
  const claimed = await db.aiIntakeSession.updateMany({
    where: { id: session.id, status: { in: [...OPEN] }, unclearCount: 0 },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) return;
  const sent = await sendAutomated(db, { conversationId: session.conversationId, ticketId, body: text });
  if (sent.outcome === "failed") {
    await db.aiIntakeSession.update({
      where: { id: session.id },
      data: { status: session.questionCount > 0 ? "waiting_client" : "collecting" },
    });
    return;
  }
  await db.aiIntakeSession.updateMany({
    where: { id: session.id, unclearCount: 0 },
    data: { unclearCount: 1, status: "waiting_client" },
  });
}

async function sendUnclearEscalate(db: PrismaClient, session: SessionRow, ticketId: string | null, text: string) {
  if (session.lastQuestionMessageId) {
    const previous = await db.message.findUnique({
      where: { id: session.lastQuestionMessageId },
      select: { sendStatus: true, body: true },
    });
    if ((previous?.sendStatus === "sent" || previous?.sendStatus === "draft") && previous.body === UNCLEAR_ESCALATE_TEXT) {
      await markStatus(db, session.id, "human_review", session.conversationId, ticketId);
      return;
    }
  }
  const claimed = await db.aiIntakeSession.updateMany({
    where: { id: session.id, status: { in: [...OPEN] }, unclearCount: { gte: 1 } },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) return;
  const ticket = await ticketService.prioritizeUnclearIntake(session.conversationId);
  if (!ticket.sendPhrase) {
    await markStatus(db, session.id, "human_review", session.conversationId, ticket.ticketId ?? ticketId);
    return;
  }
  const sent = await sendAutomated(db, { conversationId: session.conversationId, ticketId: ticket.ticketId ?? ticketId, body: text });
  if (sent.outcome === "failed") {
    await db.aiIntakeSession.update({
      where: { id: session.id },
      data: { status: "waiting_client" },
    });
    return;
  }
  await db.aiIntakeSession.update({
    where: { id: session.id },
    data: {
      status: "human_review",
      lastQuestionMessageId: sent.id,
      closeReason: "revisao",
      completedAt: new Date(),
    },
  });
  await succeedIntakeTimeouts(db, session.id);
  await writeIntakeAudit(db, {
    action: "AI_HUMAN_REVIEW_REQUIRED",
    conversationId: session.conversationId,
    ticketId: ticket.ticketId ?? ticketId,
    result: sent.outcome,
  });
}

export async function runIntakeTimeoutJob(
  db: PrismaClient,
  job: { id: string; payload: unknown; conversationId: string | null },
) {
  const payload = parseIntakeTimeoutPayload(job.payload);
  if (!payload) return;
  try {
    const session = await db.aiIntakeSession.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.questionCount !== payload.questionCount) return;
    const inboundAfter = session.lastQuestionAt
      ? await db.message.findFirst({
          where: {
            conversationId: session.conversationId,
            direction: "in",
            createdAt: { gt: session.lastQuestionAt },
          },
          select: { id: true },
        })
      : null;
    const decision = decidirTimeout({
      inboundAfterQuestion: Boolean(inboundAfter),
      nudgeSent: session.nudgeSent,
      questionCount: session.questionCount,
      sessionWaiting: session.status === "waiting_client",
    });
    if (!decision.sendNudge) {
      if (session.status !== "waiting_client" && intakeLooksOpen(session.status)) {
        await db.aiIntakeSession.updateMany({
          where: { id: session.id, status: session.status },
          data: { status: "waiting_client" },
        });
      }
      return;
    }
    const sent = await sendAutomated(db, {
      conversationId: session.conversationId,
      ticketId: null,
      body: INTAKE_NUDGE_TEXT,
    });
    if (sent.outcome === "failed") {
      await db.aiIntakeSession.updateMany({
        where: { id: session.id },
        data: { status: "waiting_client" },
      });
      throw new Error("INTAKE_TIMEOUT");
    }
    const marked = await db.aiIntakeSession.updateMany({
      where: { id: session.id, nudgeSent: false, questionCount: payload.questionCount },
      data: { nudgeSent: true, status: "waiting_client" },
    });
    if (marked.count !== 1) return;
    await writeIntakeAudit(db, {
      action: "AI_INTAKE_NUDGE",
      conversationId: session.conversationId,
      result: "nudge",
    });
  } catch (error) {
    await db.aiIntakeSession.updateMany({
      where: { id: payload.sessionId, status: { in: ["waiting_client", "processing", "collecting"] } },
      data: { status: "waiting_client" },
    });
    throw error;
  }
}

function intakeLooksOpen(status: string): boolean {
  return status === "collecting" || status === "processing";
}
