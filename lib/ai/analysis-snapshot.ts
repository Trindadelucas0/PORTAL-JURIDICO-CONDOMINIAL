import type { RagMotivo } from "@/lib/ai/retriever";
import { MODEL_MESSAGE_LIMIT } from "@/lib/ai/package";

export type FluxoMarcador = "ok" | "falhou" | "nao_registrado";

export type DocumentosPorIngestao = {
  stored: number;
  pending_index: number;
  indexed: number;
  skipped: number;
  failed: number;
};

export type FluxoMensagem = {
  body: string;
  createdAt: string;
  remetente: string;
  canal: string;
};

export type FluxoMemoria = {
  resumo: string | null;
  versaoOrigem: number | null;
  origemEm: string | null;
  fatos: string[];
};

export type FluxoExecucao = {
  condominio: FluxoMarcador;
  conversa: FluxoMarcador;
  memoria: FluxoMarcador;
  documentos: FluxoMarcador;
  rag: FluxoMarcador;
  llm: FluxoMarcador;
  validacao: FluxoMarcador;
  citations: FluxoMarcador;
};

export type DocumentosMotivo = RagMotivo | "modelo_nao_citou";

export type AnalysisFluxo = {
  mensagem: FluxoMensagem | null;
  condominioNome: string | null;
  condominioIdentificado: boolean;
  mensagensAnalisadas: number;
  memoriaUtilizada: 0 | 1;
  documentosDisponiveis: number;
  documentosRecuperados: number;
  chunksRecuperados: number;
  ragMotivo: RagMotivo;
  documentosMotivo: DocumentosMotivo | null;
  documentosPorIngestao: DocumentosPorIngestao | null;
  recuperados: Array<{ titulo: string }>;
  memoria: FluxoMemoria | null;
  execucao: FluxoExecucao;
};

export type FluxoBuildInput = {
  condominioNome: string | null;
  condominioIdentificado: boolean;
  mensagem: FluxoMensagem | null;
  mensagensCarregadas: number;
  /** Mensagens marcadas que entraram no pacote. Sem seleção, vale o teto de 12. */
  mensagensNoPacote?: number | null;
  memorySummary: string | null;
  memoryVersion: number | null;
  memoryCreatedAt: string | null;
  contactFacts: string[];
  documentosPorIngestao: DocumentosPorIngestao | null;
  ragMotivo: RagMotivo;
  chunks: Array<{ documentId?: string | null; title?: string | null }>;
  citedCount: number;
  llm: FluxoMarcador;
  validacao: FluxoMarcador;
  citations: FluxoMarcador;
  conversaOk: boolean;
};

const INGEST_KEYS = ["stored", "pending_index", "indexed", "skipped", "failed"] as const;

export function emptyIngestao(): DocumentosPorIngestao {
  return { stored: 0, pending_index: 0, indexed: 0, skipped: 0, failed: 0 };
}

export function ingestaoFromGroups(rows: Array<{ ingestStatus: string; count: number }>): DocumentosPorIngestao {
  const base = emptyIngestao();
  for (const row of rows) {
    if ((INGEST_KEYS as readonly string[]).includes(row.ingestStatus)) {
      base[row.ingestStatus as keyof DocumentosPorIngestao] = row.count;
    }
  }
  return base;
}

export function somaIngestao(value: DocumentosPorIngestao): number {
  return value.stored + value.pending_index + value.indexed + value.skipped + value.failed;
}

export function canalLabel(type: string | null | undefined): string {
  if (type === "dev_mock") return "Simulado";
  if (type === "evolution_baileys" || type === "evolution_cloud") return "WhatsApp";
  const raw = type?.trim();
  return raw || "Canal não registrado";
}

export function documentosMotivoDe(ragMotivo: RagMotivo, chunkCount: number, citedCount: number): DocumentosMotivo | null {
  if (citedCount > 0) return null;
  if (chunkCount > 0) return "modelo_nao_citou";
  return ragMotivo;
}

export function titulosRecuperados(chunks: Array<{ documentId?: string | null; title?: string | null }>): Array<{ titulo: string }> {
  const seen = new Set<string>();
  const out: Array<{ titulo: string }> = [];
  for (const chunk of chunks) {
    const key = chunk.documentId?.trim();
    const titulo = chunk.title?.trim();
    if (!key || !titulo || seen.has(key)) continue;
    seen.add(key);
    out.push({ titulo });
  }
  return out;
}

function documentosDistintos(chunks: Array<{ documentId?: string | null }>): number {
  const ids = new Set(chunks.flatMap((chunk) => (chunk.documentId?.trim() ? [chunk.documentId.trim()] : [])));
  return ids.size;
}

function ragMarker(motivo: RagMotivo): FluxoMarcador {
  if (motivo === "concluido" || motivo === "nenhum_chunk" || motivo === "similaridade_abaixo_limite") return "ok";
  return "falhou";
}

export function buildAnalysisFluxo(input: FluxoBuildInput): AnalysisFluxo {
  const fatos = input.contactFacts.map((fact) => fact.trim()).filter(Boolean).slice(0, 3);
  const resumo = input.memorySummary?.trim() ? input.memorySummary.trim() : null;
  const memoriaUtilizada: 0 | 1 = resumo || fatos.length ? 1 : 0;
  const memoria: FluxoMemoria | null = memoriaUtilizada
    ? {
        resumo,
        versaoOrigem: resumo && input.memoryVersion && input.memoryVersion > 0 ? input.memoryVersion : null,
        origemEm: resumo ? input.memoryCreatedAt : null,
        fatos,
      }
    : null;
  const ingestao = input.documentosPorIngestao;
  return {
    mensagem: input.mensagem,
    condominioNome: input.condominioNome?.trim() ? input.condominioNome.trim() : null,
    condominioIdentificado: input.condominioIdentificado,
    mensagensAnalisadas:
      input.mensagensNoPacote != null
        ? Math.max(0, input.mensagensNoPacote)
        : Math.min(Math.max(0, input.mensagensCarregadas), MODEL_MESSAGE_LIMIT),
    memoriaUtilizada,
    documentosDisponiveis: ingestao ? somaIngestao(ingestao) : 0,
    documentosRecuperados: documentosDistintos(input.chunks),
    chunksRecuperados: input.chunks.length,
    ragMotivo: input.ragMotivo,
    documentosMotivo: documentosMotivoDe(input.ragMotivo, input.chunks.length, input.citedCount),
    documentosPorIngestao: ingestao,
    recuperados: titulosRecuperados(input.chunks),
    memoria,
    execucao: {
      condominio: input.condominioIdentificado ? "ok" : "falhou",
      conversa: input.conversaOk ? "ok" : "falhou",
      memoria: "ok",
      documentos: ingestao ? "ok" : "falhou",
      rag: ragMarker(input.ragMotivo),
      llm: input.llm,
      validacao: input.validacao,
      citations: input.citations,
    },
  };
}
