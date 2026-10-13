"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { AiSummarySheet } from "@/components/chamados/ai-summary-sheet";
import { RespostaSugerida } from "@/components/chamados/ai-summary-body";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { presentCopilotRevision, type CopilotIndex } from "@/lib/ai/copilot-view";
import { isHumanReviewFallback } from "@/lib/ai/prompts/inbound-v2";

const MARCAR_E_GERAR =
  "O relato usa as mensagens do cliente que estavam Não aberta ao abrir. Intenção e a resposta usam as bolhas marcadas.";

export function AiContextSummary({
  conversationId,
  canSend = false,
  contactName,
}: {
  conversationId: string;
  canSend?: boolean;
  contactName?: string;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summaryPath = `/api/conversations/${conversationId}/ai-summary`;

  useEffect(() => {
    setSummaryOpen(false);
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

  if (summary.data?.data.enabled === false) return null;

  const sheet = (
    <AiSummarySheet
      open={summaryOpen}
      onOpenChange={setSummaryOpen}
      loading={summary.isLoading}
      error={failed}
      analyzing={analyzing}
      current={current}
      history={history}
      currentVersion={currentVersion}
      summaryPath={summaryPath}
      draftPath={`/api/conversations/${conversationId}/ai-draft`}
      regeneratePath={`/api/conversations/${conversationId}/ai-regenerate`}
      canSend={canSend}
      contactName={contactName}
    />
  );

  if (!current && (summary.isLoading || analyzing)) {
    return (
      <ResumoShell>
        <div className="mt-2 space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        {sheet}
      </ResumoShell>
    );
  }

  if (!current && failed) {
    return (
      <ResumoShell>
        <p className="mt-2 text-sm text-[var(--muted)]">Não foi possível gerar o resumo.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{MARCAR_E_GERAR}</p>
        <OpenMedidas onOpen={() => setSummaryOpen(true)} />
        {sheet}
      </ResumoShell>
    );
  }

  if (!current) {
    return (
      <ResumoShell>
        <p className="mt-2 text-sm text-[var(--muted)]">Análise ainda não realizada.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{MARCAR_E_GERAR}</p>
        <OpenMedidas onOpen={() => setSummaryOpen(true)} />
        {sheet}
      </ResumoShell>
    );
  }

  const revision = presentCopilotRevision(current);
  const textoAtual = revision.resposta.texto?.trim() ?? "";
  const hideEntrega = Boolean(textoAtual && isHumanReviewFallback(textoAtual));

  return (
    <ResumoShell>
      {failed && current && !analyzing ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          A nova análise não foi gerada. O texto abaixo é da versão anterior.
        </p>
      ) : null}
      <Sintese revision={revision} />
      {hideEntrega ? null : (
        <RespostaSugerida
          revision={revision}
          draftPath={`/api/conversations/${conversationId}/ai-draft`}
          regeneratePath={`/api/conversations/${conversationId}/ai-regenerate`}
          canSend={canSend}
          contactName={contactName}
          entrega="aprovar"
          pending={analyzing}
        />
      )}
      {analyzing ? <p className="mt-2 text-xs text-[var(--muted)]">Em análise</p> : null}
      <OpenMedidas onOpen={() => setSummaryOpen(true)} />
      {sheet}
    </ResumoShell>
  );
}

function OpenMedidas({ onOpen }: { onOpen: () => void }) {
  return (
    <Button type="button" size="sm" variant="secondary" className="mt-2 min-h-11" onClick={onOpen}>
      Ver resumo e medidas
    </Button>
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

function Sintese({ revision }: { revision: { contexto: string; problema: string } }) {
  return (
    <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
      {revision.contexto.trim() ||
        revision.problema ||
        "Não foi possível determinar o problema com as informações disponíveis."}
    </p>
  );
}
