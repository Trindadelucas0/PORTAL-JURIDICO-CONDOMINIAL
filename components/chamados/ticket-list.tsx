"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityIndicator, StatusBadge } from "@/components/ui/status-badge";
import { formatAge, formatDue, isOverdue, PRIORITY_TONE } from "@/lib/ui-labels";
import type { KanbanTicket } from "@/components/chamados/ticket-card";
import { cn } from "@/lib/utils";

export function TicketList({
  tickets,
  emptyHint,
}: {
  tickets: KanbanTicket[];
  emptyHint?: string;
}) {
  if (tickets.length === 0) {
    return <EmptyState title="Nenhum chamado" hint={emptyHint} />;
  }

  return (
    <ul className="escalonar flex flex-col gap-2">
      {tickets.map((ticket, index) => {
        const assignee = ticket.assignedTo?.nome || ticket.assignedTo?.email || "Sem responsável";
        const age = formatAge(ticket.updatedAt || ticket.createdAt);
        const due = ticket.nextDeadline;
        const overdue = due ? isOverdue(due.dueAt, due.doneAt) : false;
        const priorityBar = PRIORITY_TONE[ticket.priority]?.bar ?? PRIORITY_TONE.media.bar;

        return (
          <li key={ticket.id} style={{ "--stagger-i": index } as React.CSSProperties}>
            <Link
              href={`/chamados/${ticket.id}`}
              className="group relative block overflow-hidden rounded-[var(--radius)] border border-border bg-card px-3 py-2.5 pl-4 shadow-sm transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)]"
            >
              <span className={cn("absolute inset-y-0 left-0 w-1", priorityBar)} aria-hidden />

              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[11px] font-semibold text-foreground tabular">
                  #{ticket.protocol}
                </span>
                {age ? (
                  <span className="shrink-0 text-xs tabular text-muted-foreground">{age}</span>
                ) : null}
              </div>

              <p className="mt-1 truncate text-sm font-medium text-foreground">{ticket.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{ticket.condominium.nome}</p>

              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
                <span className="flex flex-wrap items-center gap-2">
                  <PriorityIndicator priority={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:shrink-0">
                  <span className="truncate md:max-w-[9rem]">{assignee}</span>
                  <span
                    className={cn(
                      "tabular md:w-28 md:text-right",
                      overdue ? "font-medium text-[var(--danger)]" : "text-muted-foreground",
                    )}
                  >
                    {due ? `${due.title} · ${formatDue(due.dueAt)}` : "Sem prazo"}
                  </span>
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
