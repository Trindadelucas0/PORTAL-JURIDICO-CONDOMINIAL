import { z } from "zod";

export const summarySchema = z.object({
  contexto: z.string().max(2000),
  problema: z.string().max(2000),
  documentos: z.string().max(2000),
  analise: z.string().max(4000),
  pendencias: z.string().max(2000),
  proximaAcao: z.string().max(2000),
});

export const modelOutputSchema = z.object({
  clientDraft: z.string().max(8000).optional(),
  summary: summarySchema,
  analysis: z.object({
    intencao: z.string().max(200),
    risco: z.enum(["baixo", "medio", "alto"]),
    conflitos: z.array(z.string().max(500)).max(10),
    motivoEscalonamento: z.string().max(500).nullable(),
    injectionSignal: z.boolean().optional(),
  }),
  abstain: z.boolean(),
  citations: z.array(z.object({ chunkId: z.string().min(1).max(80) })).max(8),
  contactFacts: z.array(z.string().max(200)).max(3).optional(),
  decision: z.enum(["ASK", "COMPLETE", "HUMAN_REVIEW", "UNCLEAR"]).optional(),
  question: z.string().max(500).optional(),
  confirmedFacts: z.array(z.string().max(200)).max(8).optional(),
  missingInformation: z.array(z.string().max(200)).max(8).optional(),
  triageCategory: z.enum(["cobranca", "assembleia", "obras", "vizinhanca", "administrativo", "outro"]).optional(),
  triagePriority: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type SummaryJson = z.infer<typeof summarySchema>;

export const EMPTY_SUMMARY: SummaryJson = {
  contexto: "",
  problema: "",
  documentos: "",
  analise: "",
  pendencias: "",
  proximaAcao: "",
};

export type SummaryTurn<A> = { summary: SummaryJson; analysis: A; clientDraft: string | null };

/**
 * Atendimento com relato: `contexto` vem do relato (não abertas) e o resto das marcas.
 * Com marcas, `contexto` também vem desta execução (não copia o parágrafo anterior).
 * O lado que não foi gerado nesta execução fica igual ao da revisão corrente.
 * Rascunho da revisão corrente já enviado (`draftSent`) não é copiado.
 */
export function mergePartialSummary<A>(input: {
  fromRelato: boolean;
  fromMarks: boolean;
  next: SummaryTurn<A>;
  previous: (SummaryTurn<A> & { draftSent: boolean }) | null;
  emptyAnalysis: A;
}): SummaryTurn<A> {
  const { next, previous } = input;
  const rest = input.fromMarks
    ? { summary: next.summary, analysis: next.analysis, clientDraft: next.clientDraft }
    : {
        summary: previous?.summary ?? EMPTY_SUMMARY,
        analysis: previous?.analysis ?? input.emptyAnalysis,
        clientDraft: previous && !previous.draftSent ? previous.clientDraft : null,
      };
  const contexto = input.fromMarks || input.fromRelato ? next.summary.contexto : previous?.summary.contexto ?? "";
  return { ...rest, summary: { ...rest.summary, contexto } };
}
