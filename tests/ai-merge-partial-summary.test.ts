import { describe, expect, it } from "vitest";
import { EMPTY_SUMMARY, mergePartialSummary, type SummaryJson } from "@/lib/ai/output";

type Analysis = { intencao: string; risco: string };

const EMPTY_ANALYSIS: Analysis = { intencao: "", risco: "" };

const previousSummary: SummaryJson = {
  contexto: "relato antigo",
  problema: "problema antigo",
  documentos: "doc antigo",
  analise: "análise antiga",
  pendencias: "pendência antiga",
  proximaAcao: "ação antiga",
};

const nextSummary: SummaryJson = {
  contexto: "relato novo",
  problema: "problema novo",
  documentos: "doc novo",
  analise: "análise nova",
  pendencias: "pendência nova",
  proximaAcao: "ação nova",
};

function previous(draftSent = false) {
  return {
    summary: previousSummary,
    analysis: { intencao: "pergunta", risco: "medio" },
    clientDraft: "rascunho antigo",
    draftSent,
  };
}

const next = { summary: nextSummary, analysis: { intencao: "saudacao", risco: "baixo" }, clientDraft: "rascunho novo" };

describe("mergePartialSummary", () => {
  it("sem marcas mantém clientDraft, análise e demais campos da revisão corrente; contexto vem do relato", () => {
    const merged = mergePartialSummary({ fromRelato: true, fromMarks: false, next, previous: previous(), emptyAnalysis: EMPTY_ANALYSIS });
    expect(merged.summary.contexto).toBe("relato novo");
    expect(merged.summary.analise).toBe("análise antiga");
    expect(merged.summary.problema).toBe("problema antigo");
    expect(merged.analysis).toEqual({ intencao: "pergunta", risco: "medio" });
    expect(merged.clientDraft).toBe("rascunho antigo");
  });

  it("sem relato mantém o contexto anterior; o resto vem das marcas", () => {
    const merged = mergePartialSummary({ fromRelato: false, fromMarks: true, next, previous: previous(), emptyAnalysis: EMPTY_ANALYSIS });
    expect(merged.summary).toEqual({ ...nextSummary, contexto: "relato antigo" });
    expect(merged.analysis).toEqual(next.analysis);
    expect(merged.clientDraft).toBe("rascunho novo");
  });

  it("rascunho anterior já enviado não é copiado", () => {
    const merged = mergePartialSummary({ fromRelato: true, fromMarks: false, next, previous: previous(true), emptyAnalysis: EMPTY_ANALYSIS });
    expect(merged.clientDraft).toBeNull();
    expect(merged.summary.analise).toBe("análise antiga");
  });

  it("sem revisão anterior, o lado ausente fica vazio", () => {
    const merged = mergePartialSummary({ fromRelato: true, fromMarks: false, next, previous: null, emptyAnalysis: EMPTY_ANALYSIS });
    expect(merged.summary).toEqual({ ...EMPTY_SUMMARY, contexto: "relato novo" });
    expect(merged.analysis).toEqual(EMPTY_ANALYSIS);
    expect(merged.clientDraft).toBeNull();
  });

  it("relato e marcas juntos usam tudo da execução nova", () => {
    const merged = mergePartialSummary({ fromRelato: true, fromMarks: true, next, previous: previous(), emptyAnalysis: EMPTY_ANALYSIS });
    expect(merged).toEqual(next);
  });
});
