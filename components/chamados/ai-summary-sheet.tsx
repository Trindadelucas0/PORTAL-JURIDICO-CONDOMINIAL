"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AiSummaryBody } from "@/components/chamados/ai-summary-body";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import type { CopilotHistoryItem, CopilotRevisionView } from "@/lib/ai/copilot-view";
import { formatWhen } from "@/lib/ui-labels";

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
  canSend,
  onShowConversation,
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
  canSend?: boolean;
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

  const revision = showingHistorical ? historical.data?.data.revision ?? null : current;
  const viewingVersion = picked ?? revision?.version ?? currentVersion;
  const viewingDate =
    revision?.createdAt ?? history.find((item) => item.version === viewingVersion)?.createdAt ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        style={{ width: "min(100%, 48rem)", maxWidth: "min(100%, 48rem)" }}
        className="gap-0 overflow-hidden p-0"
      >
        <SheetHeader className="relative shrink-0 border-b border-border pr-14">
          <SheetTitle>Análise do atendimento</SheetTitle>
          <SheetDescription>{identityLine(protocol, condominiumName)}</SheetDescription>
          {viewingDate && viewingVersion != null ? (
            <p className="text-xs text-muted-foreground">
              {viewingVersion === currentVersion ? "Atualizada em" : "Versão de"} {formatWhen(viewingDate)} · v{viewingVersion}
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="absolute top-3 right-3 min-h-11 min-w-11"
            aria-label="Fechar análise"
            onClick={() => onOpenChange(false)}
          >
            <X />
          </Button>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {showingHistorical && historical.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : showingHistorical && historical.isError ? (
            <div className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground">Não foi possível abrir esta versão.</p>
              <Button type="button" size="sm" variant="secondary" className="min-h-11" onClick={() => setPicked(null)}>
                Voltar à atual
              </Button>
            </div>
          ) : revision ? (
            <>
              {analyzing ? <p className="pt-3 text-xs text-muted-foreground">Processando</p> : null}
              {error ? <p className="pt-3 text-xs text-muted-foreground">A última execução falhou.</p> : null}
              <AiSummaryBody
                revision={revision}
                draftPath={draftPath}
                canSend={canSend}
                onShowConversation={onShowConversation ? () => { onShowConversation(); onOpenChange(false); } : undefined}
              />
            </>
          ) : loading ? (
            <Skeleton className="h-10 w-full" />
          ) : analyzing ? (
            <div className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground">Lendo a conversa…</p>
              <Skeleton className="h-10 w-full" />
              {onRun ? (
                <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled>
                  Em análise
                </Button>
              ) : null}
            </div>
          ) : error ? (
            <div className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground">Não foi possível atualizar o resumo.</p>
              {onRun ? (
                <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={runPending} onClick={onRun}>
                  Rodar IA
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground">Ainda não há resumo.</p>
              <p className="text-sm text-muted-foreground">A IA ainda não leu esta conversa.</p>
              {onRun ? (
                <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={runPending} onClick={onRun}>
                  Rodar IA
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {history.length > 0 ? (
          <div className="shrink-0 border-t border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">
                {viewingVersion != null ? `v${viewingVersion}` : "Versão"}
                {viewingVersion != null && viewingVersion === currentVersion ? " · Atual" : ""}
                {viewingDate ? ` · ${formatWhen(viewingDate)}` : ""}
              </p>
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-sm text-[var(--brand)]"
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
      </SheetContent>
    </Sheet>
  );
}

function identityLine(protocol?: string | null, condominiumName?: string | null): string {
  const condo = condominiumName?.trim() || "Sem condomínio";
  return protocol?.trim() ? `#${protocol.trim()} · ${condo}` : condo;
}
