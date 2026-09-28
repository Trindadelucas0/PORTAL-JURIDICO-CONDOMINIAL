import { isHumanReviewFallback } from "@/lib/ai/prompts/inbound-v2";

/**
 * Barreira determinística entre análise interna e resposta ao cliente.
 *
 * Não chama outro modelo. Bloqueia só frases operacionais inteiras e a cópia
 * longa de summary.analise para o rascunho. Palavras soltas como "análise",
 * "revisar" ou "verificar" não bloqueiam uma resposta ao cliente.
 *
 * Limite: uma análise reformulada sem esses marcadores e sem repetir o texto
 * de summary.analise (40+ caracteres) não é detectada.
 */
const INTERNAL_DRAFT_MARKERS = [
  "revisao humana",
  "analise interna",
  "nao responder ainda",
  "nao responda ao cliente",
  "aguardar analise interna",
  "o modelo identificou",
  "baixa confianca",
  "confianca insuficiente",
  "json invalido",
  "revisar manualmente",
  "revisao manual",
  "nao foi possivel interpretar",
  "revisar internamente",
  "antes de qualquer resposta ao cliente",
  "uso interno",
];

const COPY_MIN_LENGTH = 40;

export function normalizeDraftText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isInternalOperationalDraft(text: string, analise?: string | null): boolean {
  const draft = normalizeDraftText(text);
  if (!draft) return false;
  if (isHumanReviewFallback(text)) return true;
  if (INTERNAL_DRAFT_MARKERS.some((marker) => draft.includes(marker))) return true;
  const internal = normalizeDraftText(analise ?? "");
  if (internal.length < COPY_MIN_LENGTH) return false;
  return draft === internal || draft.includes(internal) || (draft.length >= COPY_MIN_LENGTH && internal.includes(draft));
}

export function gateClientDraft(input: {
  clientDraft: string | null;
  analise?: string | null;
  injection?: boolean;
}): { draftText: string | null; leaked: boolean } {
  const proposed = input.clientDraft?.trim() || null;
  if (!proposed || input.injection) return { draftText: proposed, leaked: false };
  if (isInternalOperationalDraft(proposed, input.analise)) return { draftText: null, leaked: true };
  return { draftText: proposed, leaked: false };
}
