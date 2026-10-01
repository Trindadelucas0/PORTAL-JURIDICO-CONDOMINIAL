"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import {
  AnaliseInterna,
  AnaliseInterrompida,
  ContextoUtilizado,
  DocumentosConsultados,
  EvidenciaUtilizada,
  Entendimento,
  ExecucaoAnalise,
  MemoriaUtilizada,
  MensagemCliente,
  ProximaAcao,
  RespostaSugerida,
} from "@/components/chamados/ai-summary-body";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { presentCopilotRevision, type CopilotIndex, type CopilotRevisionView } from "@/lib/ai/copilot-view";
import { isHumanReviewFallback } from "@/lib/ai/prompts/inbound-v2";
import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

const MARCAR_E_GERAR =
  "O relato usa as mensagens do cliente que estavam Não aberta ao abrir. Intenção e a resposta usam as bolhas marcadas.";

export function AiContextSummary({ conversationId, canSend = false }: { conversationId: string; canSend?: boolean }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const summaryPath = `/api/conversations/${conversationId}/ai-summary`;

  useEffect(() => {
    setOpen(false);
    setPicked(null);
    setHistoryOpen(false);
  }, [conversationId]);

  const summary = useQuery({
    queryKey: ["conversation-ai-summary", conversationId],
    enabled: Boolean(conversationId),
    queryFn: () => api<CopilotIndex>(summaryPath),
    ...livePollQuery,
  });

  const current = summary.data?.data.current ?? null;
  const analyzing = Boolean(summary.data?.data.analyzing);
  const failed = Boolean(summary.data?.data.error) || summary.isError;
  const history = summary.data?.data.history ?? [];
  const currentVersion = summary.data?.data.currentVersion ?? null;
  const showingHistorical = picked != null && picked !== currentVersion;
  const historical = useQuery({
    queryKey: ["ai-summary-version", summaryPath, picked],
    enabled: showingHistorical,
    staleTime: 60_000,
    queryFn: () => api<{ revision: CopilotRevisionView }>(`${summaryPath}?version=${picked}`),
  });

  if (summary.data?.data.enabled === false) return null;

  if (!current && (summary.isLoading || analyzing)) {
    return (
      <ResumoShell>
        <div className="mt-2 space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </ResumoShell>
    );
  }

  if (!current && failed) {
    return (
      <ResumoShell>
        <p className="mt-2 text-sm text-[var(--muted)]">Não foi possível gerar o resumo.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{MARCAR_E_GERAR}</p>
      </ResumoShell>
    );
  }

  if (!current) {
    return (
      <ResumoShell>
        <p className="mt-2 text-sm text-[var(--muted)]">Análise ainda não realizada.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{MARCAR_E_GERAR}</p>
      </ResumoShell>
    );
  }

  const live = presentCopilotRevision(current);
  const revision = showingHistorical
    ? historical.data?.data.revision
      ? presentCopilotRevision(historical.data.data.revision)
      : null
    : live;
  const viewingVersion = picked ?? revision?.version ?? currentVersion;
  const viewingDate =
    revision?.createdAt ?? history.find((item) => item.version === viewingVersion)?.createdAt ?? null;
  const textoAtual = revision?.resposta.texto?.trim() ?? "";
  const hideEntrega = Boolean(textoAtual && isHumanReviewFallback(textoAtual));

  return (
    <ResumoShell>
      {showingHistorical && historical.isLoading ? (
        <Skeleton className="mt-2 h-10 w-full" />
      ) : showingHistorical && historical.isError ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted-foreground">Não foi possível abrir esta versão.</p>
          <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setPicked(null)}>
            Voltar à atual
          </Button>
        </div>
      ) : revision ? (
        <>
          {showingHistorical && viewingDate && viewingVersion != null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Versão de {formatWhen(viewingDate)} · v{viewingVersion}
            </p>
          ) : null}
          {failed && current && !analyzing && !showingHistorical ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              A nova análise não foi gerada. O texto abaixo é da versão anterior.
            </p>
          ) : null}
          <Sintese revision={revision} />
          {showingHistorical ? (
            <EntregaHistorica revision={revision} hideEntrega={hideEntrega} onBack={() => setPicked(null)} />
          ) : hideEntrega ? null : (
            <RespostaSugerida
              revision={revision}
              draftPath={`/api/conversations/${conversationId}/ai-draft`}
              canSend={canSend}
            />
          )}
          {analyzing && !showingHistorical ? <p className="mt-2 text-xs text-[var(--muted)]">Em análise</p> : null}
        </>
      ) : null}
      <button
        type="button"
        className="mt-2 flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] py-2.5 text-left text-sm text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        aria-expanded={open}
        aria-controls="resumo-ia-detalhes"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? "Ocultar detalhes" : "Ver mais"}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && revision ? (
        <div id="resumo-ia-detalhes" className="min-w-0 overflow-x-hidden [&_blockquote]:break-words [&_dd]:break-words [&_h4]:break-words [&_p]:break-words">
          <Detalhes revision={revision} />
        </div>
      ) : null}
      {history.length > 0 ? (
        <div className="border-t border-border py-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-11"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((value) => !value)}
          >
            Ver histórico
          </Button>
          {historyOpen ? (
            <ul className="mt-2 max-h-48 overflow-y-auto border-t border-border">
              {history.map((item) => {
                const selected = item.version === (picked ?? currentVersion);
                return (
                  <li key={item.version} className="flex min-h-11 items-center justify-between gap-2">
                    <p className="min-w-0 text-sm break-words">
                      {`v${item.version}${item.version === currentVersion ? " · Atual" : ""} · ${formatWhen(item.createdAt)}`}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-11 shrink-0"
                      aria-pressed={selected}
                      onClick={() => setPicked(item.version === currentVersion ? null : item.version)}
                    >
                      Ver
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </ResumoShell>
  );
}

function ResumoShell({ children }: { children: ReactNode }) {
  return (
    <section
      id="resumo-ia"
      tabIndex={-1}
      aria-labelledby="resumo-ia-titulo"
      className="min-w-0 overflow-x-hidden rounded-[8px] border border-[#bfdbfe] bg-[var(--status-aberto-bg)] p-3 text-[var(--ink)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--brand)]"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0 text-[var(--status-aberto)]" aria-hidden />
        <h3 id="resumo-ia-titulo" className="text-[11px] font-semibold tracking-wider text-[var(--status-aberto)] uppercase">
          Resumo IA
        </h3>
      </div>
      {children}
    </section>
  );
}

function Sintese({ revision }: { revision: CopilotRevisionView }) {
  return (
    <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
      {revision.contexto.trim() ||
        revision.problema ||
        "Não foi possível determinar o problema com as informações disponíveis."}
    </p>
  );
}

function EntregaHistorica({
  revision,
  hideEntrega,
  onBack,
}: {
  revision: CopilotRevisionView;
  hideEntrega: boolean;
  onBack: () => void;
}) {
  const texto = revision.resposta.texto?.trim() ?? "";
  return (
    <div className="mt-3">
      {hideEntrega ? null : (
        <>
          <p className="text-xs font-medium tracking-wide text-muted-foreground">RESPOSTA SUGERIDA</p>
          {texto ? (
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words">{texto}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nenhum rascunho foi gravado nesta versão.</p>
          )}
        </>
      )}
      <Button type="button" size="sm" variant="secondary" className="mt-3 min-h-11" onClick={onBack}>
        Voltar à atual
      </Button>
    </div>
  );
}

function Detalhes({ revision }: { revision: CopilotRevisionView }) {
  const evidenciaInsuficiente = revision.status === "abstained" || revision.tecnica.confianca === "insuficiente";
  return (
    <>
      {evidenciaInsuficiente ? <AnaliseInterrompida revision={revision} /> : null}
      <Entendimento revision={revision} />
      <ContextoUtilizado revision={revision} recorte="contagens" />
      <EvidenciaUtilizada revision={revision} />
      <ProximaAcao revision={revision} />
      <MensagemCliente revision={revision} />
      <AnaliseInterna revision={revision} />
      <DocumentosConsultados revision={revision} />
      <ExecucaoAnalise revision={revision} />
      <ContextoUtilizado revision={revision} recorte="tecnico" />
      <MemoriaUtilizada revision={revision} />
    </>
  );
}
