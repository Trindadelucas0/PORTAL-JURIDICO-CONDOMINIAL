"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import type { DocumentosPorIngestao } from "@/lib/ai/analysis-snapshot";
import { presentCopilotRevision, type CopilotFonte, type CopilotRevisionView } from "@/lib/ai/copilot-view";
import { documentKindLabel } from "@/lib/documents/kinds";
import { formatWhen, PRIORITY_TONE, STATUS_TONE } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

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

function SectionTitle({ children, className }: { children: string; className?: string }) {
  return <h3 className={cn("text-xs font-medium tracking-wide text-muted-foreground", className)}>{children}</h3>;
}

const FAIXA_TOM = {
  neutro: "border-border bg-card",
  aviso: "border-[#fde68a] bg-[var(--status-andamento-bg)]",
  acao: "border-[#a7f3d0] border-l-2 border-l-[var(--status-resolvido)] bg-[var(--status-resolvido-bg)]",
  interno: "border-border border-l-2 border-l-[var(--brand)] bg-[var(--page)]",
} as const;

function Faixa({ tom = "neutro", children }: { tom?: keyof typeof FAIXA_TOM; children: React.ReactNode }) {
  return <section className={cn("mt-3 min-w-0 rounded-[8px] border px-3 py-3", FAIXA_TOM[tom])}>{children}</section>;
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
    <Faixa>
      <SectionTitle>MENSAGEM DO CLIENTE</SectionTitle>
      {mensagem ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {[mensagem.remetente, quando, mensagem.canal].filter(Boolean).join(" · ")}
          </p>
          <blockquote className="mt-2 rounded-[6px] border-l-2 border-l-[var(--channel-whatsapp)] bg-[var(--surface-2)] px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">
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
    </Faixa>
  );
}

export function AnaliseInterrompida({ revision }: { revision: CopilotRevisionView }) {
  const consultado = revision.contextoUtilizado.recuperados;
  const faltando = revision.pendencias.split("\n").map((line) => line.trim()).filter(Boolean);
  const motivo = motivoTexto(revision.contextoUtilizado.documentosMotivo ?? revision.contextoUtilizado.ragMotivo, revision.contextoUtilizado.registrado);
  return (
    <Faixa tom="aviso">
      <SectionTitle className="font-semibold text-[var(--status-andamento)]">ANÁLISE INTERROMPIDA</SectionTitle>
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
    </Faixa>
  );
}

export function Entendimento({ revision }: { revision: CopilotRevisionView }) {
  const nome = revision.contextoUtilizado.registrado
    ? revision.contextoUtilizado.condominioNome || "não registrado nesta versão"
    : "não registrado nesta versão";
  const percent = revision.tecnica.confiancaPercentual;
  const baixa = revision.tecnica.confianca === "baixa" || revision.tecnica.confianca === "insuficiente";
  return (
    <Faixa>
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
          <dd className="mt-1 text-sm">
            <RiskBadge value={revision.tecnica.risco} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Confiança</dt>
          <dd className="mt-1 text-sm">
            <ConfidenceBadge confianca={revision.tecnica.confianca} percentual={percent} />
          </dd>
        </div>
      </dl>
    </Faixa>
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
  if (recorte === "contagens") {
    return (
      <Faixa>
        <SectionTitle>CONTEXTO UTILIZADO</SectionTitle>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-[6px] bg-[var(--surface-2)] px-2.5 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={cn("mt-0.5 break-words", /^\d+$/.test(value) ? "text-base font-semibold tabular" : "text-xs")}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Faixa>
    );
  }
  return (
    <Faixa>
      <SectionTitle>CONTEXTO UTILIZADO</SectionTitle>
      <dl className="mt-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
            <dt className="min-w-0 text-sm text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-right text-sm break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </Faixa>
  );
}

export function DocumentosConsultados({ revision }: { revision: CopilotRevisionView }) {
  const ctx = revision.contextoUtilizado;
  return (
    <Faixa>
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
    </Faixa>
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
    <article className="rounded-[6px] border border-border bg-[var(--page)] px-3 py-3">
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
    <Faixa>
      <SectionTitle>EVIDÊNCIA UTILIZADA</SectionTitle>
      {revision.fontes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma evidência citada.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {revision.fontes.map((fonte, index) => (
            <article key={`${fonte.titulo}-ev-${index}`} className="rounded-[6px] border border-border bg-[var(--page)] px-3 py-3">
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
    </Faixa>
  );
}

export function RespostaSugerida({
  revision,
  draftPath,
  canSend,
  variant = "section",
}: {
  revision: CopilotRevisionView;
  draftPath?: string;
  canSend?: boolean;
  /** `bar`: faixa acima do campo de mensagem do Atendimento, sem título de seção. */
  variant?: "section" | "bar";
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
  const bar = variant === "bar";

  const content = (
    <>
      {editing ? (
        <textarea
          className={cn("w-full bg-transparent text-sm leading-relaxed", bar ? "min-h-20" : "min-h-28")}
          value={draft}
          aria-label="Editar resposta sugerida"
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <p className={cn("text-sm leading-relaxed whitespace-pre-wrap break-words", bar && "max-h-32 overflow-y-auto")}>{texto}</p>
      )}
      {erro ? <p className="mt-2 text-sm text-[var(--danger)]">{erro}</p> : null}
      {enviada ? <p className="mt-2 text-xs text-muted-foreground">Esta resposta já foi enviada.</p> : null}
      {!enviada && draftPath ? (
        <div className={cn("flex flex-wrap gap-2", bar ? "mt-2" : "mt-3")}>
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
    </>
  );

  if (bar) {
    if (!texto && !editing) return null;
    return (
      <div className="shrink-0 border-t border-border bg-[var(--status-aguardando-bg)] px-3 py-2">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Resposta sugerida</p>
        <div className="mt-1 min-w-0">{content}</div>
      </div>
    );
  }

  return (
    <Faixa>
      <SectionTitle>RESPOSTA SUGERIDA</SectionTitle>
      {texto || editing ? (
        <div className="mt-2 rounded-[6px] border border-border bg-[var(--status-aguardando-bg)] px-3 py-3">{content}</div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum rascunho foi gravado nesta versão.</p>
      )}
    </Faixa>
  );
}

export function AnaliseInterna({ revision }: { revision: CopilotRevisionView }) {
  const faltando = revision.status === "abstained" ? [] : revision.pendencias.split("\n").map((line) => line.trim()).filter(Boolean);
  return (
    <Faixa tom="interno">
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
    </Faixa>
  );
}

export function ProximaAcao({ revision }: { revision: CopilotRevisionView }) {
  return (
    <Faixa tom="acao">
      <SectionTitle className="font-semibold text-[var(--status-resolvido)]">PRÓXIMA AÇÃO</SectionTitle>
      <p className="mt-2 text-sm leading-relaxed">{revision.proximaAcao || "—"}</p>
    </Faixa>
  );
}

export function MemoriaUtilizada({ revision }: { revision: CopilotRevisionView }) {
  const memoria = revision.memoria;
  if (!memoria || (!memoria.resumo && memoria.fatos.length === 0)) return null;
  const quando = memoria.origemEm && !Number.isNaN(new Date(memoria.origemEm).getTime()) ? formatWhen(memoria.origemEm) : null;
  return (
    <Faixa>
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
    </Faixa>
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
    <Faixa>
      <SectionTitle>EXECUÇÃO DA ANÁLISE</SectionTitle>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
        {itens.map(([label, value]) => {
          const marca = exec.registrado ? value : "nao_registrado";
          return (
            <li key={label}>
              {label}{" "}
              <span className={cn(marca === "ok" && "font-medium text-[var(--ok)]", marca === "falhou" && "font-medium text-[var(--danger)]")}>
                {MARCA[marca] ?? "não registrado"}
              </span>
            </li>
          );
        })}
      </ul>
    </Faixa>
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

const TOM_VERDE = STATUS_TONE.resolvido.pill;
const TOM_AMBAR = STATUS_TONE.em_andamento.pill;
const TOM_CINZA = STATUS_TONE.aguardando.pill;
const TOM_VERMELHO = PRIORITY_TONE.urgente.pill;

const RISCO_TOM: Record<string, string> = { baixo: TOM_VERDE, medio: TOM_AMBAR, alto: TOM_VERMELHO };
const CONFIANCA_TOM: Record<string, string> = {
  alta: TOM_VERDE,
  media: TOM_CINZA,
  baixa: TOM_AMBAR,
  insuficiente: TOM_AMBAR,
};

function Selo({ tom, children }: { tom: string | undefined; children: string }) {
  if (!tom) return <>{children}</>;
  return (
    <span className={cn("inline-flex max-w-full items-center rounded px-2 py-0.5 text-[11px] font-semibold break-words", tom)}>
      {children}
    </span>
  );
}

export function RiskBadge({ value }: { value: string }) {
  return <Selo tom={RISCO_TOM[value]}>{riskLabel(value)}</Selo>;
}

export function ConfidenceBadge({ confianca, percentual }: { confianca: string; percentual: number | null }) {
  return <Selo tom={CONFIANCA_TOM[confianca]}>{confidenceLabel(confianca, percentual)}</Selo>;
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
