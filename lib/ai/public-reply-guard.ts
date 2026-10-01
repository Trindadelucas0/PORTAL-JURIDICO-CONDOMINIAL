import { isInternalOperationalDraft, normalizeDraftText } from "@/lib/ai/client-draft-guard";
import type { completeValidJson } from "@/lib/ai/complete-json";

/**
 * Checagem determinística do texto que pode ir ao morador (`clientDraft`).
 *
 * `reprovar`: o texto expõe análise interna, afirma ação que o copiloto não executa
 * (ele só grava rascunho e memória) ou despeja as faixas de horário do documento
 * quando o morador não perguntou a regra. `sinal`: longo ou com mais de uma pergunta;
 * o rascunho continua e a revisão humana vê o aviso.
 *
 * Frases e combinações, não palavras soltas: "análise", "regimento" ou "registrar"
 * sozinhos não reprovam.
 */
export type PublicReplyVerdict =
  | { status: "ok" }
  | { status: "sinal"; codigo: "tamanho" | "perguntas" }
  | { status: "reprovar"; codigo: "interno" | "promessa" | "despejo" };

const PUBLIC_INTERNAL_MARKERS = [
  "segundo o rag",
  "conforme o rag",
  "documentos recuperados",
  "trechos recuperados",
  "com base nos documentos encontrados",
  "com base nos trechos",
  "o sistema identificou",
  "a ia identificou",
  "a analise da ia",
  "similaridade",
  "embedding",
  "memoria utilizada",
  "contexto interno",
  "para verificar se esta em desacordo",
  "prompt do sistema",
  "ignore todas as instrucoes",
];

const FALSE_ACTION_MARKERS = [
  "ja notificamos",
  "ja registramos",
  "ja encaminhamos",
  "ja avisamos",
  "sindico foi avisado",
  "sindico sera avisado",
  "sindico ja foi",
  "ocorrencia foi aberta",
  "ocorrencia foi registrada",
  "reclamacao foi registrada",
  "registramos a ocorrencia",
  "registramos sua reclamacao",
  "vamos registrar",
  "para registrarmos",
];

const RULE_WORD = /\b(regimento|regulamento|silencio|regra|norma)\b/;
const RULE_QUESTION_TOPIC = /\b(horario|horarios|hora|horas|silencio|obra|obras|mudanca|piscina|salao)\b/;
const RULE_QUESTION_WORD = /\b(qual|quais|que horas|ate que|a partir de que|quando|pode|posso|permite)\b/;
const HOUR = /\b(\d{1,2})\s?(?:h|:)(\d{2})?\b/g;

export const PUBLIC_REPLY_MAX_WORDS = 90;
export const PUBLIC_REPLY_MAX_SENTENCES = 3;
/** Horários distintos no texto, fora os que o morador escreveu. 3+ = as duas faixas do documento. */
export const PUBLIC_REPLY_HOUR_DUMP = 3;

function hoursIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(HOUR)) {
    found.add(`${Number(match[1])}:${match[2] ?? "00"}`);
  }
  return found;
}

function asksForRule(message: string): boolean {
  return RULE_QUESTION_TOPIC.test(message) && RULE_QUESTION_WORD.test(message);
}

function dumpsRule(draft: string, message: string): boolean {
  if (asksForRule(message)) return false;
  if (!RULE_WORD.test(draft)) return false;
  const fromClient = hoursIn(message);
  const own = [...hoursIn(draft)].filter((hour) => !fromClient.has(hour));
  return own.length >= PUBLIC_REPLY_HOUR_DUMP;
}

function sentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s|$)/).map((part) => part.trim()).filter(Boolean).length;
}

export function avaliarRespostaPublica(input: {
  draft: string | null;
  mensagemCliente: string;
  analise?: string | null;
}): PublicReplyVerdict {
  const raw = input.draft?.trim();
  if (!raw) return { status: "ok" };
  const draft = normalizeDraftText(raw);
  const message = normalizeDraftText(input.mensagemCliente);

  if (isInternalOperationalDraft(raw, input.analise)) return { status: "reprovar", codigo: "interno" };
  if (PUBLIC_INTERNAL_MARKERS.some((marker) => draft.includes(marker))) return { status: "reprovar", codigo: "interno" };
  if (FALSE_ACTION_MARKERS.some((marker) => draft.includes(marker))) return { status: "reprovar", codigo: "promessa" };
  if (dumpsRule(draft, message)) return { status: "reprovar", codigo: "despejo" };

  if ((raw.match(/\?/g) ?? []).length > 1) return { status: "sinal", codigo: "perguntas" };
  const words = draft.split(" ").filter(Boolean).length;
  if (words > PUBLIC_REPLY_MAX_WORDS || sentenceCount(raw) > PUBLIC_REPLY_MAX_SENTENCES) {
    return { status: "sinal", codigo: "tamanho" };
  }
  return { status: "ok" };
}

type JsonResult = Awaited<ReturnType<typeof completeValidJson>>;
export type ValidJson = Extract<JsonResult, { ok: true }>;

export type RevisaoPublica = {
  /** Saída que segue para o turno: a regenerada, se veio JSON válido; senão a primeira. */
  output: ValidJson;
  verdict: PublicReplyVerdict;
  regenerated: boolean;
  inputTokens: number;
  outputTokens: number;
  /** Resultados para `AiAuditEvent` `PUBLIC_REPLY`, sem corpo de mensagem. */
  trail: string[];
};

/**
 * Uma regeneração no máximo. Continua reprovado (ou a regeneração não devolve JSON válido):
 * o chamador descarta o rascunho e mantém a análise.
 */
export async function revisarRespostaPublica(input: {
  first: ValidJson;
  mensagemCliente: string;
  skip: boolean;
  regenerate: (rejectedDraft: string) => Promise<JsonResult>;
}): Promise<RevisaoPublica> {
  const { first } = input;
  const judge = (row: ValidJson) =>
    avaliarRespostaPublica({
      draft: row.parsed.clientDraft ?? null,
      mensagemCliente: input.mensagemCliente,
      analise: row.parsed.summary.analise,
    });
  const base = {
    output: first,
    regenerated: false,
    inputTokens: first.completion.inputTokens,
    outputTokens: first.completion.outputTokens,
  };
  if (input.skip) return { ...base, verdict: { status: "ok" }, trail: [] };

  const firstVerdict = judge(first);
  if (firstVerdict.status === "ok") return { ...base, verdict: firstVerdict, trail: [] };
  if (firstVerdict.status === "sinal") return { ...base, verdict: firstVerdict, trail: [`sinal:${firstVerdict.codigo}`] };

  const trail = [`reprovar:${firstVerdict.codigo}`];
  const second = await input.regenerate(first.parsed.clientDraft?.trim() ?? "");
  if (!second.ok) {
    trail.push("regen:json_invalido", `descartado:${firstVerdict.codigo}`);
    return { ...base, regenerated: true, verdict: firstVerdict, trail };
  }
  const secondVerdict = judge(second);
  if (secondVerdict.status === "reprovar") trail.push(`descartado:${secondVerdict.codigo}`);
  else if (secondVerdict.status === "sinal") trail.push(`regen:sinal:${secondVerdict.codigo}`);
  else trail.push("regen:ok");
  return {
    output: second,
    verdict: secondVerdict,
    regenerated: true,
    inputTokens: first.completion.inputTokens + second.completion.inputTokens,
    outputTokens: first.completion.outputTokens + second.completion.outputTokens,
    trail,
  };
}

export function publicReplyPendencia(verdict: PublicReplyVerdict): string | null {
  if (verdict.status === "ok") return null;
  if (verdict.status === "sinal") {
    return verdict.codigo === "perguntas"
      ? "Resposta sugerida faz mais de uma pergunta ao morador."
      : "Resposta sugerida longa para WhatsApp.";
  }
  if (verdict.codigo === "despejo") return "Resposta sugerida descartada: copiava as regras do documento.";
  if (verdict.codigo === "promessa") return "Resposta sugerida descartada: afirmava ação que o sistema não executou.";
  return "Resposta sugerida descartada: expunha análise interna.";
}
