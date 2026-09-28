"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  confidenceLabel,
  intentLabel,
  riskLabel,
} from "@/components/chamados/ai-summary-body";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { presentCopilotRevision, type CopilotHistoryItem, type CopilotIndex, type CopilotRevisionView } from "@/lib/ai/copilot-view";
import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export function AiContextSummary({
  conversationId,
  canSend,
  draftPath,
}: {
  conversationId: string;
  canSend: boolean;
  draftPath: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const summaryPath = `/api/conversations/${conversationId}/ai-summary`;

  useEffect(() => {
    setOpen(false);
  }, [conversationId]);

  const summary = useQuery({
    queryKey: ["conversation-ai-summary", conversationId],
    enabled: Boolean(conversationId),
    queryFn: () => api<CopilotIndex>(summaryPath),
    ...livePollQuery,
  });

  const runAi = useMutation({
    mutationFn: () => api(`/api/conversations/${conversationId}/ai-run`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversation-ai-summary", conversationId] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Não foi possível rodar a IA"),
  });

  if (summary.data?.data.enabled === false) return null;

  const current = summary.data?.data.current ?? null;
  const analyzing = Boolean(summary.data?.data.analyzing);
  const failed = Boolean(summary.data?.data.error) || summary.isError;
  const history = summary.data?.data.history ?? [];
  const currentVersion = summary.data?.data.currentVersion ?? null;

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
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2"
          disabled={runAi.isPending}
          onClick={() => runAi.mutate()}
        >
          {runAi.isPending ? "Em análise" : "Tentar novamente"}
        </Button>
      </ResumoShell>
    );
  }

  if (!current) {
    return (
      <ResumoShell>
        <p className="mt-2 text-sm text-[var(--muted)]">Análise ainda não realizada.</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2"
          disabled={runAi.isPending || analyzing}
          onClick={() => runAi.mutate()}
        >
          {runAi.isPending || analyzing ? "Em análise" : "Rodar IA"}
        </Button>
      </ResumoShell>
    );
  }

  const live = presentCopilotRevision(current);

  return (
    <ResumoShell>
      <Sintese revision={live} />
      {analyzing ? <p className="mt-2 text-xs text-[var(--muted)]">Em análise</p> : null}
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
      {open ? (
        <div id="resumo-ia-detalhes" className="min-w-0 overflow-x-hidden [&_blockquote]:break-words [&_dd]:break-words [&_h4]:break-words [&_p]:break-words">
          <Detalhes
            live={live}
            summaryPath={summaryPath}
            history={history}
            currentVersion={currentVersion}
            draftPath={draftPath}
            canSend={canSend}
          />
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
      className="min-w-0 overflow-x-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-3 text-[var(--ink)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--brand)]"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
        <h3 id="resumo-ia-titulo" className="text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
          Resumo IA
        </h3>
      </div>
      {children}
    </section>
  );
}

function Sintese({ revision }: { revision: CopilotRevisionView }) {
  const risco = revision.tecnica.risco?.trim();
  const confianca = revision.tecnica.confianca?.trim();
  return (
    <>
      <p className="mt-2 line-clamp-4 text-sm leading-relaxed break-words">
        {revision.problema || "Não foi possível determinar o problema com as informações disponíveis."}
      </p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex min-w-0 justify-between gap-3">
          <dt className="text-[var(--muted)]">Intenção</dt>
          <dd className="min-w-0 text-right break-words">{intentLabel(revision.tecnica.intencao)}</dd>
        </div>
        {risco ? (
          <div className="flex min-w-0 justify-between gap-3">
            <dt className="text-[var(--muted)]">Risco</dt>
            <dd className="min-w-0 text-right break-words">{riskLabel(risco)}</dd>
          </div>
        ) : null}
        {confianca ? (
          <div className="flex min-w-0 justify-between gap-3">
            <dt className="text-[var(--muted)]">Confiança</dt>
            <dd className="min-w-0 text-right break-words">
              {confidenceLabel(confianca, revision.tecnica.confiancaPercentual)}
            </dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}

function Detalhes({
  live,
  summaryPath,
  history,
  currentVersion,
  draftPath,
  canSend,
}: {
  live: CopilotRevisionView;
  summaryPath: string;
  history: CopilotHistoryItem[];
  currentVersion: number | null;
  draftPath: string;
  canSend: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const showingHistorical = picked != null && picked !== currentVersion;
  const historical = useQuery({
    queryKey: ["ai-summary-version", summaryPath, picked],
    enabled: showingHistorical,
    staleTime: 60_000,
    queryFn: () => api<{ revision: CopilotRevisionView }>(`${summaryPath}?version=${picked}`),
  });

  const revision = showingHistorical
    ? historical.data?.data.revision
      ? presentCopilotRevision(historical.data.data.revision)
      : null
    : live;
  const viewingVersion = picked ?? revision?.version ?? currentVersion;
  const viewingDate =
    revision?.createdAt ?? history.find((item) => item.version === viewingVersion)?.createdAt ?? null;
  const evidenciaInsuficiente =
    revision?.status === "abstained" || revision?.tecnica.confianca === "insuficiente";

  return (
    <>
      {showingHistorical && historical.isLoading ? (
        <Skeleton className="mt-2 h-10 w-full" />
      ) : showingHistorical && historical.isError ? (
        <div className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">Não foi possível abrir esta versão.</p>
          <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setPicked(null)}>
            Voltar à atual
          </Button>
        </div>
      ) : revision ? (
        <>
          {showingHistorical && viewingDate && viewingVersion != null ? (
            <p className="pt-3 text-xs text-muted-foreground">
              Versão de {formatWhen(viewingDate)} · v{viewingVersion}
            </p>
          ) : null}
          {evidenciaInsuficiente ? <AnaliseInterrompida revision={revision} /> : null}
          <Entendimento revision={revision} />
          <ContextoUtilizado revision={revision} recorte="contagens" />
          <EvidenciaUtilizada revision={revision} />
          <ProximaAcao revision={revision} />
          <RespostaSugerida revision={revision} draftPath={draftPath} canSend={canSend} />
          <MensagemCliente revision={revision} />
          <AnaliseInterna revision={revision} />
          <DocumentosConsultados revision={revision} />
          <ExecucaoAnalise revision={revision} />
          <ContextoUtilizado revision={revision} recorte="tecnico" />
          <MemoriaUtilizada revision={revision} />
        </>
      ) : null}
      {history.length > 0 ? (
        <div className="border-t border-border py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm break-words">
              {viewingVersion != null ? `v${viewingVersion}` : "Versão"}
              {viewingVersion != null && viewingVersion === currentVersion ? " · Atual" : ""}
              {viewingDate ? ` · ${formatWhen(viewingDate)}` : ""}
            </p>
            <button
              type="button"
              className="min-h-11 shrink-0 px-2 text-sm text-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((value) => !value)}
            >
              Ver histórico
            </button>
          </div>
          {historyOpen ? (
            <ul className="mt-2 max-h-48 overflow-y-auto border-t border-border">
              {history.map((item) => {
                const selected = item.version === (picked ?? currentVersion);
                return (
                  <li key={item.version}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
                      aria-pressed={selected}
                      onClick={() => setPicked(item.version === currentVersion ? null : item.version)}
                    >
                      {`v${item.version}${item.version === currentVersion ? " · Atual" : ""} · ${formatWhen(item.createdAt)}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
