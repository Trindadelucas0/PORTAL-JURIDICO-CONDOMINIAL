"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PriorityIndicator, StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDue, isOverdue } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type DossieHeaderTicket = {
  protocol: string;
  title: string;
  status: string;
  priority: string;
  condominium: { nome: string };
  contact: { nome: string };
  assignedTo: { nome?: string; email: string } | null;
  nextOpenDeadline?: { title: string; dueAt: string; doneAt: string | null } | null;
};

export function TicketDossieHeader({
  ticket,
  loading,
  onEdit,
  onDetalhes,
  aiAnalyzing,
  showAi,
  onResumo,
  onRun,
  runPending,
}: {
  ticket: DossieHeaderTicket | null;
  loading?: boolean;
  onEdit: () => void;
  onDetalhes?: () => void;
  aiAnalyzing?: boolean;
  showAi?: boolean;
  onResumo?: () => void;
  onRun?: () => void;
  runPending?: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/chamados" className="text-sm text-[var(--brand)]">
          ← Chamados
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {showAi ? (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={onResumo} disabled={loading || !ticket}>
                Resumo IA
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={onRun} disabled={loading || !ticket || runPending || aiAnalyzing}>
                {aiAnalyzing ? "Em análise" : "Rodar IA"}
              </Button>
            </>
          ) : null}
          {onDetalhes ? (
            <Button type="button" size="sm" variant="ghost" className="lg:hidden" onClick={onDetalhes}>
              Detalhes
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={onEdit} disabled={loading || !ticket}>
            Editar dados
          </Button>
        </div>
      </div>
      {loading || !ticket ? (
        <Skeleton className="mt-2 h-16 w-full max-w-md" />
      ) : (
        <div className="mt-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight tabular-nums">#{ticket.protocol}</h1>
            <StatusBadge status={ticket.status} />
            {aiAnalyzing ? (
              <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                Em análise pela IA
              </span>
            ) : null}
            <PriorityIndicator priority={ticket.priority} />
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{ticket.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span>{ticket.condominium.nome}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            <span>{ticket.contact.nome}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            <span>{ticket.assignedTo ? ticket.assignedTo.nome || ticket.assignedTo.email : "sem responsável"}</span>
            {ticket.nextOpenDeadline ? (
              <>
                <span className="mx-1.5 text-border-strong">·</span>
                <span
                  className={cn(
                    isOverdue(ticket.nextOpenDeadline.dueAt, ticket.nextOpenDeadline.doneAt)
                      ? "text-[var(--danger)]"
                      : undefined,
                  )}
                >
                  prazo {formatDue(ticket.nextOpenDeadline.dueAt)}
                </span>
              </>
            ) : null}
          </p>
        </div>
      )}
    </header>
  );
}
