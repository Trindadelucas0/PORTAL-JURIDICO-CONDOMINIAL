import { similarityPercent } from "@/lib/ai/confidence";
import type { DocumentosPorIngestao } from "@/lib/ai/analysis-snapshot";

export type CopilotFonte = {
  titulo: string;
  pagina: number | null;
  distancia: number | null;
  similaridade: number | null;
  trecho: string | null;
  storageKey: string | null;
  tipo: string | null;
  versao: number | null;
  status: string | null;
};

export type CopilotTecnica = {
  intencao: string;
  risco: string;
  conflitos: string[];
  confianca: string;
  motivoEscalonamento: string | null;
  confiancaPercentual: number | null;
};

export type CopilotMensagem = {
  body: string;
  createdAt: string;
  remetente: string;
  canal: string;
};

export type CopilotContexto = {
  registrado: boolean;
  condominioIdentificado: boolean | null;
  condominioNome: string | null;
  mensagensAnalisadas: number | null;
  memoriaUtilizada: number | null;
  documentosDisponiveis: number | null;
  documentosRecuperados: number | null;
  chunksRecuperados: number | null;
  ragMotivo: string | null;
  documentosMotivo: string | null;
  documentosPorIngestao: DocumentosPorIngestao | null;
  recuperados: Array<{ titulo: string }>;
};

export type CopilotExecucao = {
  registrado: boolean;
  condominio: string;
  conversa: string;
  memoria: string;
  documentos: string;
  rag: string;
  llm: string;
  validacao: string;
  citations: string;
};

export type CopilotResposta = {
  texto: string | null;
  messageId: string | null;
  sendStatus: string | null;
  registrado: boolean;
};

export type CopilotMemoria = {
  resumo: string | null;
  versaoOrigem: number | null;
  origemEm: string | null;
  fatos: string[];
};

export type CopilotRevisionView = {
  version: number;
  createdAt: string;
  status: string | null;
  contexto: string;
  problema: string;
  analise: string;
  pendencias: string;
  proximaAcao: string;
  tecnica: CopilotTecnica;
  fontes: CopilotFonte[];
  mensagem: CopilotMensagem | null;
  contextoUtilizado: CopilotContexto;
  execucao: CopilotExecucao;
  resposta: CopilotResposta;
  memoria: CopilotMemoria | null;
};

export type CopilotHistoryItem = {
  version: number;
  createdAt: string;
};

export type CopilotIndex = {
  enabled: boolean;
  analyzing: boolean;
  error: boolean;
  currentVersion: number | null;
  history: CopilotHistoryItem[];
  current: CopilotRevisionView | null;
};

export type CopilotCitationInput = {
  distance: number | null;
  pageNumber: number | null;
  documentTitle: string | null;
  storageKey: string | null;
  content: string | null;
  kind?: string | null;
  contentRevision?: number | null;
  ingestStatus?: string | null;
};

export type CopilotDraftInput = {
  id: string;
  body: string;
  sendStatus: string;
};

export type CopilotRevisionInput = {
  version: number;
  createdAt: Date | string;
  status: string | null;
  summaryJson: unknown;
  citations: CopilotCitationInput[];
  draft?: CopilotDraftInput | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function blankToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function fonteFromDistance(distance: number | null): number | null {
  return distance == null ? null : similarityPercent(distance);
}

const EMPTY_CONTEXTO: CopilotContexto = {
  registrado: false,
  condominioIdentificado: null,
  condominioNome: null,
  mensagensAnalisadas: null,
  memoriaUtilizada: null,
  documentosDisponiveis: null,
  documentosRecuperados: null,
  chunksRecuperados: null,
  ragMotivo: null,
  documentosMotivo: null,
  documentosPorIngestao: null,
  recuperados: [],
};

const EMPTY_EXECUCAO: CopilotExecucao = {
  registrado: false,
  condominio: "nao_registrado",
  conversa: "nao_registrado",
  memoria: "nao_registrado",
  documentos: "nao_registrado",
  rag: "nao_registrado",
  llm: "nao_registrado",
  validacao: "nao_registrado",
  citations: "nao_registrado",
};

const EMPTY_TECNICA: CopilotTecnica = {
  intencao: "",
  risco: "",
  conflitos: [],
  confianca: "",
  motivoEscalonamento: null,
  confiancaPercentual: null,
};

const EMPTY_RESPOSTA: CopilotResposta = {
  texto: null,
  messageId: null,
  sendStatus: null,
  registrado: false,
};

export function presentCopilotRevision(view: CopilotRevisionView): CopilotRevisionView {
  const ctx = view.contextoUtilizado;
  const tecnica = view.tecnica;
  return {
    ...view,
    pendencias: typeof view.pendencias === "string" ? view.pendencias : "",
    fontes: Array.isArray(view.fontes) ? view.fontes : [],
    contextoUtilizado: ctx
      ? { ...EMPTY_CONTEXTO, ...ctx, recuperados: Array.isArray(ctx.recuperados) ? ctx.recuperados : [] }
      : EMPTY_CONTEXTO,
    tecnica: tecnica
      ? { ...EMPTY_TECNICA, ...tecnica, conflitos: Array.isArray(tecnica.conflitos) ? tecnica.conflitos : [] }
      : EMPTY_TECNICA,
    execucao: view.execucao ?? EMPTY_EXECUCAO,
    resposta: view.resposta ?? EMPTY_RESPOSTA,
  };
}

function readIngestao(value: unknown): DocumentosPorIngestao | null {
  const row = asRecord(value);
  const keys = ["stored", "pending_index", "indexed", "skipped"] as const;
  if (keys.some((key) => asNumberOrNull(row[key]) == null)) return null;
  return {
    stored: asNumberOrNull(row.stored) ?? 0,
    pending_index: asNumberOrNull(row.pending_index) ?? 0,
    indexed: asNumberOrNull(row.indexed) ?? 0,
    skipped: asNumberOrNull(row.skipped) ?? 0,
  };
}

function readRecuperados(value: unknown): Array<{ titulo: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const titulo = asString(asRecord(item).titulo).trim();
    return titulo ? [{ titulo }] : [];
  });
}

function readMensagem(fluxo: Record<string, unknown>): CopilotMensagem | null {
  const row = asRecord(fluxo.mensagem);
  const body = asString(row.body).trim();
  if (!body) return null;
  return {
    body,
    createdAt: asString(row.createdAt),
    remetente: asString(row.remetente).trim() || "Cliente",
    canal: asString(row.canal).trim() || "Canal não registrado",
  };
}

function readContexto(fluxo: Record<string, unknown> | null): CopilotContexto {
  if (!fluxo) return EMPTY_CONTEXTO;
  return {
    registrado: true,
    condominioIdentificado: typeof fluxo.condominioIdentificado === "boolean" ? fluxo.condominioIdentificado : null,
    condominioNome: blankToNull(fluxo.condominioNome),
    mensagensAnalisadas: asNumberOrNull(fluxo.mensagensAnalisadas),
    memoriaUtilizada: asNumberOrNull(fluxo.memoriaUtilizada),
    documentosDisponiveis: asNumberOrNull(fluxo.documentosDisponiveis),
    documentosRecuperados: asNumberOrNull(fluxo.documentosRecuperados),
    chunksRecuperados: asNumberOrNull(fluxo.chunksRecuperados),
    ragMotivo: blankToNull(fluxo.ragMotivo),
    documentosMotivo: blankToNull(fluxo.documentosMotivo),
    documentosPorIngestao: readIngestao(fluxo.documentosPorIngestao),
    recuperados: readRecuperados(fluxo.recuperados),
  };
}

function readMarcador(value: unknown): string {
  if (value === "ok" || value === "falhou" || value === "nao_registrado") return value;
  return "nao_registrado";
}

function readExecucao(fluxo: Record<string, unknown> | null): CopilotExecucao {
  if (!fluxo) return EMPTY_EXECUCAO;
  const row = asRecord(fluxo.execucao);
  if (!Object.keys(row).length) return EMPTY_EXECUCAO;
  return {
    registrado: true,
    condominio: readMarcador(row.condominio),
    conversa: readMarcador(row.conversa),
    memoria: readMarcador(row.memoria),
    documentos: readMarcador(row.documentos),
    rag: readMarcador(row.rag),
    llm: readMarcador(row.llm),
    validacao: readMarcador(row.validacao),
    citations: readMarcador(row.citations),
  };
}

function readMemoria(fluxo: Record<string, unknown> | null): CopilotMemoria | null {
  if (!fluxo) return null;
  const row = asRecord(fluxo.memoria);
  if (!Object.keys(row).length) return null;
  const resumo = blankToNull(row.resumo);
  const fatos = asStringList(row.fatos).map((fact) => fact.trim()).filter(Boolean);
  if (!resumo && fatos.length === 0) return null;
  return {
    resumo,
    versaoOrigem: asNumberOrNull(row.versaoOrigem),
    origemEm: blankToNull(row.origemEm),
    fatos,
  };
}

function readResposta(summary: Record<string, unknown>, draft: CopilotDraftInput | null | undefined): CopilotResposta {
  const hasKey = Object.prototype.hasOwnProperty.call(summary, "respostaSugerida");
  if (hasKey) {
    return {
      texto: blankToNull(summary.respostaSugerida),
      messageId: draft?.id ?? null,
      sendStatus: draft?.sendStatus ?? null,
      registrado: true,
    };
  }
  const fromDraft = blankToNull(draft?.body);
  if (fromDraft && draft) {
    return { texto: fromDraft, messageId: draft.id, sendStatus: draft.sendStatus, registrado: true };
  }
  return { texto: null, messageId: null, sendStatus: null, registrado: false };
}

export function buildCopilotRevisionView(input: CopilotRevisionInput): CopilotRevisionView {
  const summary = asRecord(input.summaryJson);
  const tecnica = asRecord(summary.tecnica);
  const fluxo = summary.fluxo && typeof summary.fluxo === "object" && !Array.isArray(summary.fluxo)
    ? (summary.fluxo as Record<string, unknown>)
    : null;
  const fontes: CopilotFonte[] = input.citations.map((citation) => {
    const distancia = asNumberOrNull(citation.distance);
    return {
      titulo: citation.documentTitle?.trim() || "Documento sem título",
      pagina: citation.pageNumber,
      distancia,
      similaridade: fonteFromDistance(distancia),
      trecho: citation.content,
      storageKey: citation.storageKey?.trim() ? citation.storageKey : null,
      tipo: citation.kind?.trim() ? citation.kind : null,
      versao: typeof citation.contentRevision === "number" ? citation.contentRevision : null,
      status: citation.ingestStatus?.trim() ? citation.ingestStatus : null,
    };
  });

  const distances = fontes.flatMap((fonte) => (fonte.distancia == null ? [] : [fonte.distancia]));
  const worst = distances.length ? Math.max(...distances) : null;

  return {
    version: input.version,
    createdAt: input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt,
    status: input.status,
    contexto: asString(summary.contexto),
    problema: asString(summary.problema),
    analise: asString(summary.analise),
    pendencias: asString(summary.pendencias),
    proximaAcao: asString(summary.proximaAcao),
    tecnica: {
      intencao: asString(tecnica.intencao),
      risco: asString(tecnica.risco),
      conflitos: asStringList(tecnica.conflitos),
      confianca: asString(tecnica.confianca),
      motivoEscalonamento: blankToNull(tecnica.motivoEscalonamento),
      confiancaPercentual: worst == null ? null : similarityPercent(worst),
    },
    fontes,
    mensagem: fluxo ? readMensagem(fluxo) : null,
    contextoUtilizado: readContexto(fluxo),
    execucao: readExecucao(fluxo),
    resposta: readResposta(summary, input.draft),
    memoria: readMemoria(fluxo),
  };
}
