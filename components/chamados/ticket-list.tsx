"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityIndicator, StatusBadge } from "@/components/ui/status-badge";
import { formatAge, formatDue } from "@/lib/ui-labels";
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
    <ul className="divide-y divide-border border-t border-border">
      {tickets.map((ticket) => {
        const assignee = ticket.assignedTo?.nome || ticket.assignedTo?.email || "Sem responsável";
        const age = formatAge(ticket.updatedAt || ticket.createdAt);
        const due = ticket.nextDeadline;
        const overdue = due && !due.doneAt && new Date(due.dueAt).getTime() < Date.now();
        return (
          <li key={ticket.id}>
            <Link
              href={`/chamados/${ticket.id}`}
              className="flex flex-col gap-1 px-1 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-muted/40 md:flex-row md:items-center md:gap-3"
            >
              <span className="w-24 shrink-0 text-xs font-semibold tabular text-muted-foreground">
                #{ticket.protocol}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{ticket.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{ticket.condominium.nome}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <PriorityIndicator priority={ticket.priority} />
                <StatusBadge status={ticket.status} />
              </span>
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{assignee}</span>
              <span
                className={cn(
                  "w-28 shrink-0 text-xs tabular",
                  overdue ? "text-[var(--danger)]" : "text-muted-foreground",
                )}
              >
                {due ? `${due.title} · ${formatDue(due.dueAt)}` : "—"}
              </span>
              <span className="w-10 shrink-0 text-right text-xs tabular text-muted-foreground">{age ?? "—"}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
