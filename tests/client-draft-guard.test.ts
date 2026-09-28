import { describe, expect, it } from "vitest";
import { shouldDispatchAiDraft } from "@/lib/ai/auto-actions";
import { gateClientDraft, isInternalOperationalDraft } from "@/lib/ai/client-draft-guard";
import { decideTurn } from "@/lib/ai/decide-turn";
import { FALLBACK_HUMAN_REVIEW } from "@/lib/ai/prompts/inbound-v2";

const analise = "Cliente informou problema X e precisamos confirmar Y.";
const summary = {
  contexto: "c",
  problema: "p",
  documentos: "",
  analise,
  pendencias: "",
  proximaAcao: "",
};

function published(draftText: string | null, serverFallback: "human_review" | null) {
  const decision = decideTurn({
    autoDraft: true,
    memoryEnabled: true,
    abstain: serverFallback === "human_review",
    injection: false,
    serverFallback,
    requestedActions: ["CREATE_DRAFT"],
    interactionExists: false,
    currentVersion: 0,
    expectedVersion: 0,
    draftText,
    summary,
  });
  return {
    body: decision.draftBody,
    whatsapp: shouldDispatchAiDraft({ sendEnabled: true, injection: false, serverFallback }),
  };
}

describe("isolamento clientDraft", () => {
  it("permite resposta legítima ao cliente", () => {
    const texto = "Olá, João. Recebemos sua solicitação e vamos verificar o problema informado.";
    const gated = gateClientDraft({ clientDraft: texto, analise });
    expect(gated.leaked).toBe(false);
    expect(gated.draftText).toBe(texto);
    expect(gated.draftText).not.toBe(analise);
    const sent = published(gated.draftText, null);
    expect(sent.body).toBe(texto);
    expect(sent.whatsapp).toBe(true);
  });

  it("permite palavras soltas de atendimento", () => {
    const texto = "Vamos analisar o pedido e revisar a confirmação do salão.";
    expect(isInternalOperationalDraft(texto, analise)).toBe(false);
  });

  it("bloqueia a frase de revisão humana e não publica", () => {
    const gated = gateClientDraft({ clientDraft: FALLBACK_HUMAN_REVIEW, analise });
    expect(gated).toEqual({ draftText: null, leaked: true });
    const sent = published(gated.draftText, "human_review");
    expect(sent.body).toBeNull();
    expect(sent.whatsapp).toBe(false);
  });

  it("bloqueia análise reformulada", () => {
    const texto = "O modelo identificou que precisamos revisar internamente o caso antes de responder.";
    const gated = gateClientDraft({ clientDraft: texto, analise });
    expect(gated.draftText).toBeNull();
    expect(gated.leaked).toBe(true);
    expect(published(null, "human_review")).toEqual({ body: null, whatsapp: false });
  });

  it("bloqueia cópia de summary.analise para o rascunho", () => {
    const longa = "Cliente informou vazamento na unidade 12 e a equipe ainda precisa confirmar a origem com o zelador.";
    const gated = gateClientDraft({ clientDraft: longa, analise: longa });
    expect(gated.draftText).toBeNull();
    expect(gated.leaked).toBe(true);
  });

  it("não trata a recusa de injeção como vazamento", () => {
    const gated = gateClientDraft({
      clientDraft: "Não consigo seguir esse pedido. Se quiser, pergunte sobre uma regra deste condomínio que o escritório possa verificar.",
      analise: "injection_signal",
      injection: true,
    });
    expect(gated.leaked).toBe(false);
    expect(gated.draftText).toContain("Não consigo seguir");
  });
});
