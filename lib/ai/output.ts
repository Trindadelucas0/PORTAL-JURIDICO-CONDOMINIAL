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
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type SummaryJson = z.infer<typeof summarySchema>;
