import { avaliarRespostaPublica } from "@/lib/ai/public-reply-guard";

export const INTAKE_QUESTION_CAP = 4;
export const MEDIA_WAIT_ATTEMPT_CAP = 6;
export const MEDIA_WAIT_MS = 5000;
export const INTAKE_WAIT_MS_DEFAULT = 180_000;

export const IMAGE_HANDOFF_TEXT = "Vou repassar o seu chamado para o responsável e dar prioridade.";
export const SAUDACAO_ABERTURA = "Pode me contar o que aconteceu?";
export const UNCLEAR_REPEAT_TEXT = "Não entendi. Pode repetir?";
export const UNCLEAR_ESCALATE_TEXT =
  "Não consegui entender o pedido. Abri um chamado e dei prioridade para a equipe te responder.";
export const INTAKE_NUDGE_TEXT =
  "Quando puder, responda a pergunta anterior para eu encaminhar seu atendimento.";

export const INTAKE_OPEN_STATUSES = ["collecting", "waiting_client", "processing"] as const;

export const INTAKE_AUDIT_ACTIONS = [
  "AI_INTAKE_STARTED",
  "AI_QUESTION_SENT",
  "AI_INTAKE_NUDGE",
  "AI_CONTEXT_UPDATED",
  "AI_INTAKE_COMPLETED",
  "AI_INTAKE_INTERRUPTED",
  "AI_HUMAN_REVIEW_REQUIRED",
] as const;

export type IntakeAuditAction = (typeof INTAKE_AUDIT_ACTIONS)[number];
export type IntakeModelDecision = "ASK" | "COMPLETE" | "HUMAN_REVIEW" | "UNCLEAR";
export type IntakeOpenStatus = (typeof INTAKE_OPEN_STATUSES)[number];
export type PublicReplyStatus = "ok" | "sinal" | "reprovar";

export type IntakeAnexo = { nome: string; texto?: string };

export type IntakeContext = {
  problema: string;
  confirmado: string[];
  falta: string[];
  proximaAcao: string;
  anexos: IntakeAnexo[];
};

export type IntakePlanKind =
  | "skip"
  | "ask"
  | "answer"
  | "complete"
  | "human_review"
  | "unclear_repeat"
  | "unclear_escalate"
  | "image_handoff";

export type IntakePlan = {
  kind: IntakePlanKind;
  sendWhatsapp: boolean;
  text: string | null;
  suppressDraft: boolean;
  incrementQuestion: boolean;
  nextStatus: "waiting_client" | "ready_for_human" | "human_review" | null;
  startSession: boolean;
};

export type DecidirInput = {
  manual: boolean;
  hasCondominium: boolean;
  sessionStatus: string | null;
  questionCount: number;
  unclearCount: number;
  modelDecision: IntakeModelDecision | null;
  question: string | null;
  /** Frase ao morador quando não há ASK. Corta em 800, o mesmo teto de `sendAutomated`. */
  answer: string | null;
  publicReplyStatus: PublicReplyStatus;
  riskHigh: boolean;
  injection: boolean;
  jsonInvalid: boolean;
  greetingSentThisInbound: boolean;
  humanPublicAfterBatchStart: boolean;
};

export type UnclearTicketAction = "promote" | "raise" | "keep" | "none";

export const INTAKE_TRIAGE_CATEGORIES = ["cobranca", "assembleia", "obras", "vizinhanca", "administrativo", "outro"] as const;
export const INTAKE_TRIAGE_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export type IntakeTriageCategory = (typeof INTAKE_TRIAGE_CATEGORIES)[number];
export type IntakeTriagePriority = (typeof INTAKE_TRIAGE_PRIORITIES)[number];

const SKIP: IntakePlan = {
  kind: "skip",
  sendWhatsapp: false,
  text: null,
  suppressDraft: false,
  incrementQuestion: false,
  nextStatus: null,
  startSession: false,
};

function plan(partial: Partial<IntakePlan> & Pick<IntakePlan, "kind">): IntakePlan {
  return { ...SKIP, ...partial, sendWhatsapp: partial.sendWhatsapp ?? false };
}

function answerText(input: DecidirInput): string {
  return input.answer?.trim() ?? "";
}

function canSendAnswer(input: DecidirInput): boolean {
  if (input.modelDecision !== "COMPLETE" && input.modelDecision !== null) return false;
  return Boolean(answerText(input) && input.publicReplyStatus === "ok");
}

function suppressPublicDraft(input: DecidirInput): boolean {
  return input.modelDecision === "ASK" || input.modelDecision === "UNCLEAR" || canSendAnswer(input);
}

function answerPlan(input: DecidirInput): IntakePlan {
  return plan({
    kind: "answer",
    sendWhatsapp: true,
    text: answerText(input).slice(0, 800),
    suppressDraft: true,
    incrementQuestion: false,
    nextStatus: "waiting_client",
    startSession: true,
  });
}

/** Decisão pura da coleta. Não envia WhatsApp e não grava banco. */
export function decidir(input: DecidirInput): IntakePlan {
  if (input.manual || !input.hasCondominium) return SKIP;

  if (input.jsonInvalid || input.injection || input.riskHigh) {
    return plan({
      kind: "human_review",
      suppressDraft: input.modelDecision === "ASK" || input.modelDecision === "UNCLEAR",
      nextStatus: "human_review",
      startSession: true,
    });
  }

  if (input.sessionStatus === "interrupted") {
    return plan({
      kind: "skip",
      suppressDraft: suppressPublicDraft(input),
    });
  }

  if (
    input.humanPublicAfterBatchStart &&
    (input.modelDecision === "ASK" || input.modelDecision === "UNCLEAR" || canSendAnswer(input))
  ) {
    return plan({ kind: "skip", suppressDraft: true });
  }

  if (input.modelDecision === "UNCLEAR") {
    if (input.unclearCount <= 0) {
      return plan({
        kind: "unclear_repeat",
        sendWhatsapp: true,
        text: UNCLEAR_REPEAT_TEXT,
        suppressDraft: true,
        nextStatus: "waiting_client",
        startSession: true,
      });
    }
    return plan({
      kind: "unclear_escalate",
      sendWhatsapp: true,
      text: UNCLEAR_ESCALATE_TEXT,
      suppressDraft: true,
      nextStatus: "human_review",
      startSession: true,
    });
  }

  if (canSendAnswer(input)) return answerPlan(input);

  if (input.questionCount >= INTAKE_QUESTION_CAP) {
    if (input.modelDecision === "COMPLETE") {
      return plan({ kind: "complete", nextStatus: "ready_for_human", startSession: true });
    }
    if (input.modelDecision === "ASK" || input.modelDecision === "HUMAN_REVIEW") {
      return plan({
        kind: "human_review",
        suppressDraft: input.modelDecision === "ASK",
        nextStatus: "human_review",
        startSession: true,
      });
    }
  }

  if (input.modelDecision === "HUMAN_REVIEW") {
    return plan({ kind: "human_review", nextStatus: "human_review", startSession: true });
  }

  if (input.modelDecision === "COMPLETE") {
    return plan({ kind: "complete", nextStatus: "ready_for_human", startSession: true });
  }

  if (input.modelDecision === "ASK") {
    const question = input.question?.trim() ?? "";
    if (input.publicReplyStatus !== "ok" || !question || input.questionCount >= INTAKE_QUESTION_CAP) {
      return plan({
        kind: "human_review",
        suppressDraft: true,
        nextStatus: "human_review",
        startSession: true,
      });
    }
    return plan({
      kind: "ask",
      sendWhatsapp: true,
      text: question.slice(0, 500),
      suppressDraft: true,
      incrementQuestion: true,
      nextStatus: "waiting_client",
      startSession: true,
    });
  }

  return SKIP;
}

/**
 * JSON antigo sem `decision`: uma pergunta curta já aprovada para o morador vira ASK.
 * Frase sem interrogação aprovada vira `answer` no `decidir`. Risco alto e JSON inválido não vão ao WhatsApp.
 */
export function coagirAskSemDecision(input: {
  modelDecision: IntakeModelDecision | null;
  clientDraft: string | null;
  question: string | null;
  mensagemCliente: string;
}): { modelDecision: IntakeModelDecision | null; question: string | null } {
  if (input.modelDecision) {
    return { modelDecision: input.modelDecision, question: input.question };
  }
  const draft = input.clientDraft?.trim() ?? "";
  if ((draft.match(/\?/g) ?? []).length !== 1) {
    return { modelDecision: null, question: input.question };
  }
  const verdict = avaliarRespostaPublica({ draft, mensagemCliente: input.mensagemCliente });
  if (verdict.status !== "ok") return { modelDecision: null, question: input.question };
  return { modelDecision: "ASK", question: draft.slice(0, 500) };
}

/** Triagem aberta recebe o diagnóstico. Não muda status e não cria chamado. */
export function patchTriagemAberta(input: {
  status: string | null | undefined;
  category?: string | null;
  priority?: string | null;
}): { category?: IntakeTriageCategory; priority?: IntakeTriagePriority } | null {
  if (input.status !== "aberto") return null;
  const category = INTAKE_TRIAGE_CATEGORIES.find((item) => item === input.category);
  const priority = INTAKE_TRIAGE_PRIORITIES.find((item) => item === input.priority);
  if (!category && !priority) return null;
  return {
    ...(category ? { category } : {}),
    ...(priority ? { priority } : {}),
  };
}

/** Segunda UNCLEAR: categoria já gravada; se vazia ou inválida, outro. */
export function categoriaChamadoUnclear(saved: string | null | undefined): IntakeTriageCategory {
  return INTAKE_TRIAGE_CATEGORIES.find((item) => item === saved) ?? "outro";
}

const CLOSED_SESSION = new Set(["interrupted", "completed", "ready_for_human", "human_review"]);

/** Sessão encerrada de um chamado anterior não conta no chamado reaberto. */
export function sessionCountsForTurn(input: {
  session: { status: string; questionCount: number; unclearCount: number; startedAt: Date } | null;
  openTicketCreatedAt: Date | null;
}): { sessionStatus: string | null; questionCount: number; unclearCount: number } {
  if (!input.session) return { sessionStatus: null, questionCount: 0, unclearCount: 0 };
  if (intakeSessionOpen(input.session.status)) {
    return {
      sessionStatus: input.session.status,
      questionCount: input.session.questionCount,
      unclearCount: input.session.unclearCount,
    };
  }
  if (
    CLOSED_SESSION.has(input.session.status) &&
    input.openTicketCreatedAt &&
    input.session.startedAt.getTime() < input.openTicketCreatedAt.getTime()
  ) {
    return { sessionStatus: null, questionCount: 0, unclearCount: 0 };
  }
  return {
    sessionStatus: input.session.status,
    questionCount: input.session.questionCount,
    unclearCount: input.session.unclearCount,
  };
}

/** Minuto do dia em America/Sao_Paulo (`businessMinutes`). */
export function saudacaoPorMinuto(minutes: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  if (minutes >= 5 * 60 && minutes < 12 * 60) return "Bom dia";
  if (minutes >= 12 * 60 && minutes < 18 * 60) return "Boa tarde";
  return "Boa noite";
}

/** Primeira frase pública da sessão. As seguintes saem sem repetir o cumprimento. */
export function comSaudacao(texto: string, saudacao: string, jaFalou: boolean): string {
  const body = texto.trim();
  if (jaFalou) return body;
  if (!body) return `${saudacao}.`;
  return `${saudacao}. ${body}`;
}

/** Foto depois que a conversa já tem outra mensagem. A primeira mensagem, PDF e áudio ficam de fora. */
export function imagemNoMeio(input: { temImagem: boolean; houveMensagemAntes: boolean }): boolean {
  return input.temImagem && input.houveMensagemAntes;
}

/** Foto no meio: sobe baixa/média para alta. Alta e urgente permanecem. Sem chamado, promove. */
export function prioridadeAposImagem(
  priority: "baixa" | "media" | "alta" | "urgente" | null,
): "raise" | "keep" | "promote" {
  if (!priority) return "promote";
  if (priority === "baixa" || priority === "media") return "raise";
  return "keep";
}

export function intakeSessionOpen(status: string | null | undefined): boolean {
  return status === "collecting" || status === "waiting_client" || status === "processing";
}

export function intakeListLabel(status: string | null | undefined, questionCount: number): string | null {
  if (!status || status === "interrupted") return null;
  if (intakeSessionOpen(status)) return `IA coletando ${questionCount}/4`;
  if (status === "ready_for_human" || status === "completed") return "IA preparada";
  if (status === "human_review") return "Revisão humana necessária";
  return null;
}

export function decidirInterrupcao(status: string | null): { allowed: boolean; next: "interrupted" } {
  return { allowed: intakeSessionOpen(status), next: "interrupted" };
}

export function shouldDeferAskForMedia(input: { pendingMediaJobs: number; attempts: number }): boolean {
  return input.pendingMediaJobs > 0 && input.attempts < MEDIA_WAIT_ATTEMPT_CAP;
}

export function inboundKeysToShift(keys: string[], isMessageKey: (key: string) => boolean): string[] {
  return keys.filter((key) => isMessageKey(key));
}

export function intakeTimeoutKey(sessionId: string, questionCount: number): string {
  return `intake-timeout:${sessionId}:${questionCount}`;
}

export function intakeWaitMs(
  env: { AI_INTAKE_WAIT_MS?: string } = { AI_INTAKE_WAIT_MS: process.env.AI_INTAKE_WAIT_MS },
): number {
  const raw = env.AI_INTAKE_WAIT_MS?.trim();
  if (!raw) return INTAKE_WAIT_MS_DEFAULT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return INTAKE_WAIT_MS_DEFAULT;
  return Math.floor(value);
}

export function parseIntakeTimeoutPayload(payload: unknown): { sessionId: string; questionCount: number } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as { sessionId?: unknown; questionCount?: unknown };
  if (typeof row.sessionId !== "string" || !row.sessionId.trim()) return null;
  if (typeof row.questionCount !== "number" || !Number.isInteger(row.questionCount) || row.questionCount < 0) return null;
  return { sessionId: row.sessionId, questionCount: row.questionCount };
}

/** Um lembrete no máximo. Silêncio não dispara a próxima pergunta. */
export function decidirTimeout(input: {
  inboundAfterQuestion: boolean;
  nudgeSent: boolean;
  questionCount: number;
  sessionWaiting: boolean;
}): { sendNudge: boolean; sessionStatus: "waiting_client" } {
  if (!input.sessionWaiting || input.inboundAfterQuestion || input.nudgeSent) {
    return { sendNudge: false, sessionStatus: "waiting_client" };
  }
  if (input.questionCount >= 1 && input.questionCount <= 3) {
    return { sendNudge: true, sessionStatus: "waiting_client" };
  }
  return { sendNudge: false, sessionStatus: "waiting_client" };
}

/**
 * Segunda UNCLEAR. Não cria chamado se já existe um em aberto.
 * Sem admin, a frase não sai.
 */
export function decidirChamadoUnclear(input: {
  hasAdmin: boolean;
  triageOpen: boolean;
  contactHasCondominium: boolean;
  openTicket: { priority: "baixa" | "media" | "alta" | "urgente" } | null;
}): { sendPhrase: boolean; action: UnclearTicketAction } {
  if (!input.hasAdmin) return { sendPhrase: false, action: "none" };
  if (input.openTicket) {
    if (input.openTicket.priority === "baixa" || input.openTicket.priority === "media") {
      return { sendPhrase: true, action: "raise" };
    }
    return { sendPhrase: true, action: "keep" };
  }
  if (input.triageOpen && input.contactHasCondominium) {
    return { sendPhrase: true, action: "promote" };
  }
  return { sendPhrase: false, action: "none" };
}

export function emptyIntakeContext(): IntakeContext {
  return { problema: "", confirmado: [], falta: [], proximaAcao: "", anexos: [] };
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit).map((item) => item.trim());
}

export function parseIntakeContext(value: unknown): IntakeContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyIntakeContext();
  const row = value as Record<string, unknown>;
  const anexos = Array.isArray(row.anexos)
    ? row.anexos.slice(0, 6).flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const nome = (item as { nome?: unknown }).nome;
        if (typeof nome !== "string" || !nome.trim()) return [];
        const texto = (item as { texto?: unknown }).texto;
        return [{ nome: nome.trim().slice(0, 180), ...(typeof texto === "string" && texto.trim() ? { texto: texto.trim().slice(0, 8000) } : {}) }];
      })
    : [];
  return {
    problema: typeof row.problema === "string" ? row.problema.trim().slice(0, 500) : "",
    confirmado: stringList(row.confirmado, 8).map((item) => item.slice(0, 200)),
    falta: stringList(row.falta, 8).map((item) => item.slice(0, 200)),
    proximaAcao: typeof row.proximaAcao === "string" ? row.proximaAcao.trim().slice(0, 500) : "",
    anexos,
  };
}

/** Lista da Inbox: sem texto de PDF. */
export function slimIntakeContext(value: unknown): Omit<IntakeContext, "anexos"> | null {
  const parsed = parseIntakeContext(value);
  const slim = {
    problema: parsed.problema.slice(0, 180),
    confirmado: parsed.confirmado.slice(0, 4).map((item) => item.slice(0, 120)),
    falta: parsed.falta.slice(0, 4).map((item) => item.slice(0, 120)),
    proximaAcao: parsed.proximaAcao.slice(0, 180),
  };
  if (!slim.problema && !slim.proximaAcao && !slim.confirmado.length && !slim.falta.length) return null;
  return slim;
}

export function mergeIntakeContext(previous: unknown, patch: Partial<IntakeContext>): IntakeContext {
  const base = parseIntakeContext(previous);
  return {
    problema: patch.problema?.trim() ? patch.problema.trim().slice(0, 500) : base.problema,
    confirmado: patch.confirmado?.length ? patch.confirmado.slice(0, 8).map((item) => item.slice(0, 200)) : base.confirmado,
    falta: patch.falta?.length ? patch.falta.slice(0, 8).map((item) => item.slice(0, 200)) : base.falta,
    proximaAcao: patch.proximaAcao?.trim() ? patch.proximaAcao.trim().slice(0, 500) : base.proximaAcao,
    anexos: patch.anexos?.length ? patch.anexos.slice(0, 6) : base.anexos,
  };
}

export function intakeContextChanged(before: unknown, after: IntakeContext): boolean {
  const left = parseIntakeContext(before);
  return JSON.stringify(left) !== JSON.stringify(after);
}
