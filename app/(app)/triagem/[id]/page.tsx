"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ForbiddenState, ErrorBanner } from "@/components/ui/error-state";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TriageAnalysisPanel } from "@/components/triagem/triage-analysis-panel";
import { api } from "@/lib/client/api";

type Item = { id: string };

export default function TriagemAnalisePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const itemQ = useQuery({
    queryKey: ["triage", id],
    queryFn: () => api<Item>(`/api/triage/${id}`),
  });

  if (itemQ.isError) {
    const status = (itemQ.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState />;
    if (status === 404) return <EmptyState title="Solicitação não encontrada" />;
    return <ErrorBanner message="Falha ao carregar análise." onRetry={() => itemQ.refetch()} />;
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <Link href="/triagem" className="text-sm text-[var(--brand)]">
          ← Triagem
        </Link>
        <h1 className="mt-1 text-sm font-semibold">Analisar solicitação</h1>
      </div>
      {itemQ.isLoading ? <Skeleton className="m-3 h-48" /> : <TriageAnalysisPanel id={id} showThread />}
    </div>
  );
}
