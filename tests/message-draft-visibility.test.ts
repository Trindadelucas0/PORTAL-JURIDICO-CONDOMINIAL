import { describe, expect, it } from "vitest";
import { isHiddenReviewDraft, isRedundantAiDraft, sentPublicBodies } from "@/components/atendimento/message-bubbles";
import { FALLBACK_HUMAN_REVIEW } from "@/lib/ai/prompts/inbound-v2";

type Row = { body: string; direction: "in" | "out"; visibility: "publica" | "interna"; sendStatus?: string };

const draft = (body: string): Row => ({ body, direction: "out", visibility: "publica", sendStatus: "draft" });
const sent = (body: string): Row => ({ body, direction: "out", visibility: "publica", sendStatus: "sent" });

describe("sentPublicBodies", () => {
  it("junta só saída pública enviada, com trim", () => {
    const bodies = sentPublicBodies([
      sent("  Boa tarde  "),
      draft("rascunho"),
      { body: "nota", direction: "out", visibility: "interna", sendStatus: "sent" },
      { body: "cliente", direction: "in", visibility: "publica", sendStatus: "sent" },
      { body: "falhou", direction: "out", visibility: "publica", sendStatus: "failed" },
    ]);
    expect([...bodies]).toEqual(["Boa tarde"]);
  });
});

describe("isRedundantAiDraft", () => {
  it("esconde rascunho com o mesmo texto de uma mensagem já enviada", () => {
    const sentBodies = sentPublicBodies([sent("Boa tarde! O silêncio é das 22h às 7h.")]);
    expect(isRedundantAiDraft(draft("Boa tarde! O silêncio é das 22h às 7h.\n"), { sentBodies })).toBe(true);
  });

  it("mantém rascunho com texto diferente", () => {
    const sentBodies = sentPublicBodies([sent("Boa tarde!")]);
    expect(isRedundantAiDraft(draft("Boa noite!"), { sentBodies })).toBe(false);
  });

  it("não funde textos que só diferem em maiúsculas", () => {
    const sentBodies = sentPublicBodies([sent("Boa tarde")]);
    expect(isRedundantAiDraft(draft("boa tarde"), { sentBodies })).toBe(false);
  });

  it("esconde rascunho igual à resposta sugerida corrente", () => {
    expect(isRedundantAiDraft(draft("Texto da IA"), { sentBodies: new Set(), suggestedText: " Texto da IA " })).toBe(true);
  });

  it("resposta sugerida vazia não esconde nada", () => {
    expect(isRedundantAiDraft(draft("Texto"), { sentBodies: new Set(), suggestedText: "  " })).toBe(false);
  });

  it("mensagem enviada nunca é filtrada", () => {
    const row = sent("Texto");
    expect(isRedundantAiDraft(row, { sentBodies: sentPublicBodies([row]), suggestedText: "Texto" })).toBe(false);
  });

  it("frase de revisão humana continua em isHiddenReviewDraft", () => {
    expect(isHiddenReviewDraft(draft(FALLBACK_HUMAN_REVIEW))).toBe(true);
    expect(isRedundantAiDraft(draft(FALLBACK_HUMAN_REVIEW), { sentBodies: new Set() })).toBe(false);
  });
});
