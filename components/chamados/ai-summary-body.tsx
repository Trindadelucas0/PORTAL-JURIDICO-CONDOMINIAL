"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import type { DocumentosPorIngestao } from "@/lib/ai/analysis-snapshot";
import { presentCopilotRevision, type CopilotFonte, type CopilotRevisionView } from "@/lib/ai/copilot-view";
import { documentKindLabel } from "@/lib/documents/kinds";
import { formatWhen } from "@/lib/ui-labels";

const BAND: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  insuficiente: "Insuficiente",
};

const INTENT: Record<string, string> = {
  pergunta: "Pergunta",
  saudacao: "Saudação",
  injection: "Injeção",
};

const INGEST: Record<string, string> = {
  stored: "armazenado",
  pending_index: "aguardando indexação",
  indexed: "indexado",
  skipped: "ingestão pulada",
};

const MOTIVO: Record<string, string> = {
  rag_desligado: "RAG não executado.",
  sem_condominio: "Nenhum condomínio identificado.",
  sem_consulta: "Nenhum texto para consultar.",
  embedding_indisponivel: "Embedding indisponível.",
  nenhum_chunk: "Nenhum documento encontrado.",
  similaridade_abaixo_limite: "Similaridade abaixo do limite.",
  modelo_nao_citou: "A IA não citou os trechos recuperados.",
};

const RAG_NAO_EXECUTADO = new Set(["rag_desligado", "sem_condominio", "sem_consulta", "embedding_indisponivel"]);

const MARCA: Record<string, string> = {
  ok: "ok",
  falhou: "falhou",
  nao_registrado: "não registrado",
};

export function AiSummaryBody({
  revision,
  draftPath,
  canSend,
  onShowConversation,
}: {
  revision: CopilotRevisionView;
  draftPath?: string;
  canSend?: boolean;
  onShowConversation?: () => void;
}) {
  const view = presentCopilotRevision(revision);
  const interrompida = view.status === "abstained";
  return (
    <div>
      <MensagemCliente revision={view} onShowConversation={onShowConversation} />
      {interrompida ? <AnaliseInterrompida revision={view} /> : null}
      <Entendimento revision={view} />
      <ContextoUtilizado revision={view} />
      <DocumentosConsultados revision={view} />
      <EvidenciaUtilizada revision={view} />
      <RespostaSugerida revision={view} draftPath={draftPath} canSend={canSend} />
      <AnaliseInterna revision={view} />
      <ProximaAcao revision={view} />
      <MemoriaUtilizada revision={view} />
      <ExecucaoAnalise revision={view} />
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{children}</h3>;
}

export function MensagemCliente({
  revision,
  onShowConversation,
}: {
  revision: CopilotRevisionView;
  onShowConversation?: () => void;
}) {
  const mensagem = revision.mensagem;
  const quando = mensagem?.createdAt && !Number.isNaN(new Date(mensagem.createdAt).getTime()) ? formatWhen(mensagem.createdAt) : null;
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>MENSAGEM DO CLIENTE</SectionTitle>
      {mensagem ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {[mensagem.remetente, quando, mensagem.canal].filter(Boolean).join(" · ")}
          </p>
          <blockquote className="mt-2 border border-border px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            “{mensagem.body}”
          </blockquote>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Mensagem não registrada nesta versão.</p>
      )}
      {onShowConversation ? (
        <button type="button" className="mt-2 min-h-11 text-sm text-[var(--brand)]" onClick={onShowConversation}>
          Ver conversa completa
        </button>
      ) : null}
    </section>
  );
}

export function AnaliseInterrompida({ revision }: { revision: CopilotRevisionView }) {
  const consultado = revision.contextoUtilizado.recuperados;
  const faltando = revision.pendencias.split("\n").map((line) => line.trim()).filter(Boolean);
  const motivo = motivoTexto(revision.contextoUtilizado.documentosMotivo ?? revision.contextoUtilizado.ragMotivo, revision.contextoUtilizado.registrado);
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>ANÁLISE INTERROMPIDA</SectionTitle>
      <p className="mt-2 text-sm leading-relaxed">
        A IA não encontrou evidências suficientes para sustentar uma resposta segura.
      </p>
      <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground">O QUE FOI CONSULTADO</p>
      {consultado.length ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">Enviado ao modelo</p>
          <ul className="mt-1 space-y-1">
            {consultado.map((item) => (
              <li key={item.titulo} className="text-sm">{item.titulo}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{motivo}</p>
      )}
      <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground">O QUE ESTÁ FALTANDO</p>
      {faltando.length ? (
        <ul className="mt-1 space-y-1">
          {faltando.map((line) => (
            <li key={line} className="text-sm">{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">—</p>
      )}
    </section>
  );
}

export function Entendimento({ revision }: { revision: CopilotRevisionView }) {
  const nome = revision.contextoUtilizado.registrado
    ? revision.contextoUtilizado.condominioNome || "não registrado nesta versão"
    : "não registrado nesta versão";
  const percent = revision.tecnica.confiancaPercentual;
  const baixa = revision.tecnica.confianca === "baixa" || revision.tecnica.confianca === "insuficiente";
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>ENTENDIMENTO</SectionTitle>
      <p className="mt-2 text-sm leading-relaxed">
        {revision.problema || "Não foi possível determinar o problema com as informações disponíveis."}
      </p>
      {revision.status !== "abstained" && baixa ? (
        <p className="mt-2 text-sm text-muted-foreground">A IA não possui evidências suficientes para responder com segurança.</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Intenção</dt>
          <dd className="mt-1 text-sm">{intentLabel(revision.tecnica.intencao)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Condomínio</dt>
          <dd className="mt-1 text-sm">{nome}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Risco</dt>
          <dd className="mt-1 text-sm">{riskLabel(revision.tecnica.risco)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Confiança</dt>
          <dd className="mt-1 text-sm">{confidenceLabel(revision.tecnica.confianca, percent)}</dd>
        </div>
      </dl>
    </section>
  );
}

const CONTAGENS_CONTEXTO = new Set([
  "Mensagens analisadas",
  "Memória utilizada",
  "Documentos disponíveis",
  "Documentos recuperados",
]);

export function ContextoUtilizado({
  revision,
  recorte = "completo",
}: {
  revision: CopilotRevisionView;
  recorte?: "completo" | "contagens" | "tecnico";
}) {
  const ctx = revision.contextoUtilizado;
  const all: Array<[string, string]> = [
    ["Condomínio", ctx.registrado ? (ctx.condominioIdentificado ? "sim" : "não") : "não registrado nesta versão"],
    ["Mensagens analisadas", numero(ctx.mensagensAnalisadas, ctx.registrado)],
    ["Memória utilizada", numero(ctx.memoriaUtilizada, ctx.registrado)],
    ["Documentos disponíveis", numero(ctx.documentosDisponiveis, ctx.registrado)],
    ["Documentos recuperados", numero(ctx.documentosRecuperados, ctx.registrado)],
    ["Chunks recuperados", numero(ctx.chunksRecuperados, ctx.registrado)],
    ["RAG", ragTexto(ctx.ragMotivo, ctx.registrado)],
  ];
  const rows = all.filter(([label]) => {
    if (recorte === "contagens") return CONTAGENS_CONTEXTO.has(label);
    if (recorte === "tecnico") return !CONTAGENS_CONTEXTO.has(label);
    return true;
  });
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>CONTEXTO UTILIZADO</SectionTitle>
      <dl className="mt-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
            <dt className="min-w-0 text-sm text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-right text-sm break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DocumentosConsultados({ revision }: { revision: CopilotRevisionView }) {
  const ctx = revision.contextoUtilizado;
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>DOCUMENTOS CONSULTADOS</SectionTitle>
      {revision.fontes.length === 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-sm">0 documentos recuperados.</p>
          <p className="text-sm text-muted-foreground">
            {motivoTexto(ctx.documentosMotivo ?? ctx.ragMotivo, ctx.registrado)}
          </p>
          {ingestResumo(ctx.documentosPorIngestao) ? (
            <p className="text-sm text-muted-foreground">{ingestResumo(ctx.documentosPorIngestao)}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {revision.fontes.map((fonte, index) => (
            <DocumentoCard key={`${fonte.titulo}-${fonte.pagina ?? "s"}-${index}`} fonte={fonte} condominio={ctx.condominioNome} />
          ))}
        </div>
      )}
    </section>
  );
}

function DocumentoCard({ fonte, condominio }: { fonte: CopilotFonte; condominio: string | null }) {
  const [open, setOpen] = useState(false);
  const trecho = fonte.trecho?.trim() ?? "";
  const long = trecho.length > 280;
  const meta = [
    fonte.pagina != null ? `Página ${fonte.pagina}` : null,
    fonte.tipo ? documentKindLabel(fonte.tipo) : null,
    fonte.versao != null ? `v${fonte.versao}` : null,
    fonte.status ? INGEST[fonte.status] ?? fonte.status : null,
    fonte.similaridade != null ? `Similaridade ${fonte.similaridade}%` : null,
    condominio,
  ].filter(Boolean);
  return (
    <article className="border border-border px-3 py-3">
      <h4 className="text-sm font-medium">{fonte.titulo}</h4>
      {meta.length ? <p className="mt-1 text-xs text-muted-foreground">{meta.join(" · ")}</p> : null}
      {trecho ? (
        <blockquote className={open || !long ? "mt-2 text-sm leading-relaxed whitespace-pre-wrap" : "mt-2 line-clamp-6 text-sm leading-relaxed whitespace-pre-wrap"}>
          “{trecho}”
        </blockquote>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Citation sem trecho gravado.</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {long ? (
          <button type="button" className="min-h-11 text-sm text-[var(--brand)]" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? "Ocultar trecho" : "Abrir trecho"}
          </button>
        ) : null}
        {fonte.storageKey ? (
          <a className="inline-flex min-h-11 items-center text-sm text-[var(--brand)]" href={`/api/files/${fonte.storageKey}`}>
            Ver documento
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function EvidenciaUtilizada({ revision }: { revision: CopilotRevisionView }) {
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>EVIDÊNCIA UTILIZADA</SectionTitle>
      {revision.fontes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma evidência citada.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {revision.fontes.map((fonte, index) => (
            <article key={`${fonte.titulo}-ev-${index}`} className="border border-border px-3 py-3">
              <h4 className="text-sm font-medium">{fonte.titulo}</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {fonte.pagina != null ? `Página ${fonte.pagina}` : "Página não registrada"}
                {fonte.similaridade != null ? ` · Similaridade ${fonte.similaridade}%` : ""}
              </p>
              {fonte.trecho?.trim() ? (
                <blockquote className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">“{fonte.trecho.trim()}”</blockquote>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Citation sem trecho gravado.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function RespostaSugerida({
  revision,
  draftPath,
  canSend,
}: {
  revision: CopilotRevisionView;
  draftPath?: string;
  canSend?: boolean;
}) {
  const qc = useQueryClient();
  const texto = revision.resposta.texto;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(texto ?? "");
  const enviada = revision.resposta.sendStatus === "sent";

  useEffect(() => {
    setDraft(texto ?? "");
    setEditing(false);
  }, [revision.version, texto]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["conversation-ai-summary"] });
    await qc.invalidateQueries({ queryKey: ["ticket-ai-summary"] });
    await qc.invalidateQueries({ queryKey: ["ai-summary-version"] });
    await qc.invalidateQueries({ queryKey: ["messages"] });
    await qc.invalidateQueries({ queryKey: ["ticket-messages"] });
  };

  const save = useMutation({
    mutationFn: () =>
      api(draftPath || "", {
        method: "PATCH",
        body: JSON.stringify({ version: revision.version, text: draft.trim() }),
      }),
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });
  const send = useMutation({
    mutationFn: () =>
      api(draftPath || "", {
        method: "POST",
        body: JSON.stringify({ version: revision.version }),
      }),
    onSuccess: async () => {
      await invalidate();
    },
  });
  const erro = (save.error || send.error) instanceof Error ? ((save.error || send.error) as Error).message : null;

  return (
    <section className="border-b border-border py-4">
      <SectionTitle>RESPOSTA SUGERIDA</SectionTitle>
      {texto || editing ? (
        <div className="mt-2 border border-border px-3 py-3">
          {editing ? (
            <textarea
              className="min-h-28 w-full bg-transparent text-sm leading-relaxed"
              value={draft}
              aria-label="Editar resposta sugerida"
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{texto}</p>
          )}
          {erro ? <p className="mt-2 text-sm text-[var(--danger)]">{erro}</p> : null}
          {enviada ? <p className="mt-2 text-xs text-muted-foreground">Esta resposta já foi enviada.</p> : null}
          {!enviada && draftPath ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {editing ? (
                <>
                  <Button type="button" size="sm" className="min-h-11" disabled={save.isPending || !draft.trim()} onClick={() => save.mutate()}>
                    {save.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => { setDraft(texto ?? ""); setEditing(false); }}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setEditing(true)}>
                  Editar resposta
                </Button>
              )}
              {canSend && !editing ? (
                <Button type="button" size="sm" className="min-h-11" disabled={send.isPending} onClick={() => send.mutate()}>
                  {send.isPending ? "Enviando…" : "Enviar ao cliente"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum rascunho foi gravado nesta versão.</p>
      )}
    </section>
  );
}

export function AnaliseInterna({ revision }: { revision: CopilotRevisionView }) {
  const faltando = revision.status === "abstained" ? [] : revision.pendencias.split("\n").map((line) => line.trim()).filter(Boolean);
  return (
    <section className="border-b border-border border-l-2 border-l-[var(--brand)] bg-[var(--page)] py-4 pl-3">
      <SectionTitle>ANÁLISE INTERNA</SectionTitle>
      <p className="mt-1 text-xs font-medium tracking-wide text-[var(--brand)]">Uso interno</p>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{revision.analise || "—"}</p>
      {revision.tecnica.conflitos.length ? (
        <p className="mt-2 text-sm">Conflitos: {revision.tecnica.conflitos.join(", ")}</p>
      ) : null}
      {revision.tecnica.motivoEscalonamento ? (
        <p className="mt-2 text-sm">Motivo do escalonamento: {revision.tecnica.motivoEscalonamento}</p>
      ) : null}
      {faltando.length ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">Informações faltantes</p>
          <ul className="mt-1 space-y-1">
            {faltando.map((line) => (
              <li key={line} className="text-sm">{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export function ProximaAcao({ revision }: { revision: CopilotRevisionView }) {
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>PRÓXIMA AÇÃO</SectionTitle>
      <p className="mt-2 text-sm leading-relaxed">{revision.proximaAcao || "—"}</p>
    </section>
  );
}

export function MemoriaUtilizada({ revision }: { revision: CopilotRevisionView }) {
  const memoria = revision.memoria;
  if (!memoria || (!memoria.resumo && memoria.fatos.length === 0)) return null;
  const quando = memoria.origemEm && !Number.isNaN(new Date(memoria.origemEm).getTime()) ? formatWhen(memoria.origemEm) : null;
  return (
    <section className="border-b border-border py-4">
      <SectionTitle>MEMÓRIA UTILIZADA</SectionTitle>
      {memoria.resumo ? <p className="mt-2 text-sm leading-relaxed">{memoria.resumo}</p> : null}
      {memoria.fatos.length ? (
        <ul className="mt-2 space-y-1">
          {memoria.fatos.map((fato) => (
            <li key={fato} className="text-sm">{fato}</li>
          ))}
        </ul>
      ) : null}
      {memoria.versaoOrigem || quando ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {[memoria.versaoOrigem ? `Versão ${memoria.versaoOrigem}` : null, quando].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

export function ExecucaoAnalise({ revision }: { revision: CopilotRevisionView }) {
  const exec = revision.execucao;
  const itens = [
    ["Condomínio", exec.condominio],
    ["Conversa", exec.conversa],
    ["Memória", exec.memoria],
    ["Documentos", exec.documentos],
    ["RAG", exec.rag],
    ["LLM", exec.llm],
    ["Validação", exec.validacao],
    ["Citations", exec.citations],
  ] as const;
  return (
    <section className="py-4">
      <SectionTitle>EXECUÇÃO DA ANÁLISE</SectionTitle>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {itens.map(([label, value]) => `${label} ${exec.registrado ? MARCA[value] ?? "não registrado" : "não registrado"}`).join(" · ")}
      </p>
    </section>
  );
}

function numero(value: number | null, registrado: boolean): string {
  if (!registrado || value == null) return "não registrado nesta versão";
  return String(value);
}

function ragTexto(motivo: string | null, registrado: boolean): string {
  if (!registrado || !motivo) return "não registrado nesta versão";
  if (RAG_NAO_EXECUTADO.has(motivo)) return `não executado · ${MOTIVO[motivo] ?? "motivo não registrado nesta versão"}`;
  return "concluído";
}

function motivoTexto(codigo: string | null, registrado: boolean): string {
  if (!registrado || !codigo) return "Motivo não registrado nesta versão.";
  return MOTIVO[codigo] ?? "Motivo não registrado nesta versão.";
}

function ingestResumo(value: DocumentosPorIngestao | null): string | null {
  if (!value) return null;
  const parts = [
    value.indexed ? `${value.indexed} indexados` : null,
    value.pending_index ? `${value.pending_index} aguardando indexação` : null,
    value.stored ? `${value.stored} armazenados` : null,
    value.skipped ? `${value.skipped} com ingestão pulada` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return `No condomínio: ${parts.join(", ")}.`;
}

export function riskLabel(value: string): string {
  if (value === "medio") return "Médio";
  if (value === "alto") return "Alto";
  if (value === "baixo") return "Baixo";
  return value || "—";
}

export function intentLabel(value: string): string {
  if (!value) return "—";
  return INTENT[value] ?? value;
}

export function confidenceLabel(confianca: string, percentual: number | null): string {
  const banda = BAND[confianca] ?? (confianca || "—");
  return percentual != null ? `${percentual}% · ${banda}` : banda;
}
