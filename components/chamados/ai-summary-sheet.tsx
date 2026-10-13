"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import type { CopilotFonte, CopilotHistoryItem, CopilotMedida, CopilotRevisionView } from "@/lib/ai/copilot-view";
import { presentCopilotRevision } from "@/lib/ai/copilot-view";
import { isHumanReviewFallback } from "@/lib/ai/prompts/inbound-v2";
import { formatWhen } from "@/lib/ui-labels";
import { RespostaSugerida } from "@/components/chamados/ai-summary-body";

export function AiSummarySheet({
  open,
  onOpenChange,
  loading,
  error,
  analyzing,
  current,
  history,
  currentVersion,
  summaryPath,
  protocol,
  condominiumName,
  onRun,
  runPending,
  draftPath,
  regeneratePath,
  canSend,
  contactName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  error?: boolean;
  analyzing?: boolean;
  current: CopilotRevisionView | null;
  history: CopilotHistoryItem[];
  currentVersion: number | null;
  summaryPath: string;
  protocol?: string | null;
  condominiumName?: string | null;
  onRun?: () => void;
  runPending?: boolean;
  draftPath?: string;
  regeneratePath?: string;
  canSend?: boolean;
  contactName?: string;
  onShowConversation?: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const showingHistorical = picked != null && picked !== currentVersion;

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setHistoryOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setPicked(null);
    setHistoryOpen(false);
  }, [summaryPath]);

  const historical = useQuery({
    queryKey: ["ai-summary-version", summaryPath, picked],
    enabled: Boolean(open && showingHistorical),
    staleTime: 60_000,
    queryFn: () => api<{ revision: CopilotRevisionView }>(`${summaryPath}?version=${picked}`),
  });

  const raw = showingHistorical ? historical.data?.data.revision ?? null : current;
  const revision = raw ? presentCopilotRevision(raw) : null;
  const viewingVersion = picked ?? revision?.version ?? currentVersion;
  const viewingDate =
    revision?.createdAt ?? history.find((item) => item.version === viewingVersion)?.createdAt ?? null;
  const textoAtual = revision?.resposta.texto?.trim() ?? "";
  const hideEntrega = Boolean(textoAtual && isHumanReviewFallback(textoAtual));
  const showFaixa = Boolean(revision && !hideEntrega && revision.resposta.sendStatus !== "sent");
  const liveEntrega = Boolean(revision && !showingHistorical);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Resumo e medidas"
      className="flex max-h-[min(85dvh,42rem)] w-full flex-col overflow-hidden sm:max-w-5xl"
    >
      <p className="text-sm text-muted-foreground">{identityLine(protocol, condominiumName)}</p>
      {viewingDate && viewingVersion != null ? (
        <p className="text-xs text-muted-foreground">
          {viewingVersion === currentVersion ? "Atualizada em" : "Versão de"} {formatWhen(viewingDate)} · v{viewingVersion}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {showingHistorical && historical.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : showingHistorical && historical.isError ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Não foi possível abrir esta versão.</p>
            <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setPicked(null)}>
              Voltar à atual
            </Button>
          </div>
        ) : revision ? (
          <>
            {analyzing ? <p className="text-xs text-muted-foreground">Processando</p> : null}
            {error ? <p className="text-xs text-muted-foreground">A última execução falhou.</p> : null}
            <Colunas
              revision={revision}
              onRun={showingHistorical ? undefined : onRun}
              runPending={runPending}
              analyzing={analyzing}
            />
          </>
        ) : loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : analyzing ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Lendo a conversa…</p>
            <Skeleton className="h-10 w-full" />
            {onRun ? (
              <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled>
                Em análise
              </Button>
            ) : null}
          </div>
        ) : error ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Não foi possível atualizar o resumo.</p>
            <RunHint onRun={onRun} runPending={runPending} />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Ainda não há resumo.</p>
            <p className="text-sm text-muted-foreground">A IA ainda não leu esta conversa.</p>
            <RunHint onRun={onRun} runPending={runPending} />
          </div>
        )}
      </div>

      {showFaixa || history.length > 0 ? (
        <DialogFooter className="block shrink-0 space-y-3 px-4 pt-3 pb-4 sm:block">
          {showFaixa && revision ? (
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Resposta sugerida</p>
              <RespostaSugerida
                revision={revision}
                draftPath={liveEntrega ? draftPath : undefined}
                regeneratePath={liveEntrega ? regeneratePath : undefined}
                canSend={liveEntrega ? canSend : false}
                contactName={contactName}
                entrega="aprovar"
                pending={analyzing}
                variant="dialog"
              />
            </div>
          ) : null}

          {history.length > 0 ? (
            <div className={showFaixa ? "border-t border-border pt-3" : undefined}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {viewingVersion != null ? `v${viewingVersion}` : "Versão"}
                  {viewingVersion != null && viewingVersion === currentVersion ? " · Atual" : ""}
                  {viewingDate ? ` · ${formatWhen(viewingDate)}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {showingHistorical ? (
                    <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setPicked(null)}>
                      Voltar à atual
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className="min-h-11 shrink-0 px-2 text-sm text-[var(--brand)]"
                    aria-expanded={historyOpen}
                    onClick={() => setHistoryOpen((value) => !value)}
                  >
                    Ver histórico
                  </button>
                </div>
              </div>
              {historyOpen ? (
                <ul className="mt-2 max-h-48 overflow-y-auto border-t border-border">
                  {history.map((item) => {
                    const selected = item.version === (picked ?? currentVersion);
                    return (
                      <li key={item.version}>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center text-left text-sm"
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
        </DialogFooter>
      ) : null}
    </Dialog>
  );
}

function Colunas({
  revision,
  onRun,
  runPending,
  analyzing,
}: {
  revision: CopilotRevisionView;
  onRun?: () => void;
  runPending?: boolean;
  analyzing?: boolean;
}) {
  const resumo =
    revision.contexto.trim() ||
    revision.problema ||
    "Não foi possível determinar o problema com as informações disponíveis.";
  return (
    <div className="mt-2 grid min-h-0 gap-3 md:grid-cols-2">
      <section className="min-h-0 overflow-y-auto rounded-[8px] border border-[#bfdbfe] bg-[var(--status-aberto-bg)] p-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-[var(--status-aberto)] uppercase">
          Resumo da conversa
        </h3>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words">{resumo}</p>
      </section>
      <section className="min-h-0 overflow-y-auto rounded-[8px] border border-[#a7f3d0] border-l-2 border-l-[var(--status-resolvido)] bg-[var(--status-resolvido-bg)] p-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-[var(--status-resolvido)] uppercase">
          Medidas para a advogada
        </h3>
        <MedidasLista medidas={revision.medidas} onRun={onRun} runPending={runPending} analyzing={analyzing} />
      </section>
    </div>
  );
}

function MedidasLista({
  medidas,
  onRun,
  runPending,
  analyzing,
}: {
  medidas: CopilotMedida[] | null;
  onRun?: () => void;
  runPending?: boolean;
  analyzing?: boolean;
}) {
  if (medidas == null) {
    return (
      <div className="mt-2 space-y-3">
        <p className="text-sm text-muted-foreground">Esta versão não tem medidas.</p>
        {analyzing ? null : <RunHint onRun={onRun} runPending={runPending} />}
      </div>
    );
  }
  if (medidas.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">Nenhuma medida nesta análise.</p>;
  }
  return (
    <ol className="mt-2 space-y-3">
      {medidas.map((medida, index) => (
        <li key={`${medida.oQueFazer}-${index}`}>
          <article className="rounded-[6px] border border-border bg-[var(--page)] px-3 py-3">
            <p className="text-sm font-medium leading-relaxed">
              <span className="tabular text-muted-foreground">{index + 1}. </span>
              {medida.oQueFazer}
            </p>
            {medida.avaliacao ? (
              <p className="mt-2 text-sm leading-relaxed">
                <span className="text-xs font-medium tracking-wide text-muted-foreground">Avaliação: </span>
                {medida.avaliacao}
              </p>
            ) : null}
            {medida.fonte ? <TrechoFonte fonte={medida.fonte} /> : (
              <p className="mt-2 text-sm text-muted-foreground">Sem trecho de documento.</p>
            )}
          </article>
        </li>
      ))}
    </ol>
  );
}

function TrechoFonte({ fonte }: { fonte: CopilotFonte }) {
  const [open, setOpen] = useState(false);
  const trecho = fonte.trecho?.trim() ?? "";
  const long = trecho.length > 280;
  const meta = [
    fonte.pagina != null ? `Página ${fonte.pagina}` : null,
    fonte.titulo,
  ].filter(Boolean);
  return (
    <div className="mt-2">
      {meta.length ? <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p> : null}
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
    </div>
  );
}

function RunHint({ onRun, runPending }: { onRun?: () => void; runPending?: boolean }) {
  if (onRun) {
    return (
      <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={runPending} onClick={onRun}>
        Rodar IA
      </Button>
    );
  }
  return <p className="text-sm text-muted-foreground">Use Gerar resumo no topo da conversa.</p>;
}

function identityLine(protocol?: string | null, condominiumName?: string | null): string {
  const condo = condominiumName?.trim() || "Sem condomínio";
  return protocol?.trim() ? `#${protocol.trim()} · ${condo}` : condo;
}
