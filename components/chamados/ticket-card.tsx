"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRIORITY_TONE, STATUS_LABEL, TICKET_STATUSES, formatAge, formatDue, isOverdue } from "@/lib/ui-labels";
import { PriorityIndicator } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type NextDeadline = {
  dueAt: string;
  title: string;
  doneAt: string | null;
};

export type KanbanTicket = {
  id: string;
  protocol: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  updatedAt?: string;
  createdAt?: string;
  assignedTo: { id?: string; email: string; nome?: string } | null;
  condominium: { id?: string; nome: string };
  contact: { nome: string };
  nextDeadline?: NextDeadline | null;
  _count?: { documents?: number; messages?: number };
};

export function TicketCard({
  ticket,
  onMove,
  moving,
  handle,
  showHandle = true,
}: {
  ticket: KanbanTicket;
  onMove: (status: string) => void;
  moving?: boolean;
  handle?: ReactNode;
  showHandle?: boolean;
}) {
  const router = useRouter();
  const assignee = ticket.assignedTo?.nome || ticket.assignedTo?.email || "—";
  const age = formatAge(ticket.updatedAt || ticket.createdAt);
  const priorityBar = PRIORITY_TONE[ticket.priority]?.bar ?? PRIORITY_TONE.media.bar;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-md border border-border/80 bg-card text-left transition-colors duration-[var(--motion-fast)] hover:bg-muted/40",
        moving && "opacity-60",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-0.5", priorityBar)} aria-hidden />
      <div className="flex items-start gap-0.5 py-1.5 pr-1 pl-2.5">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => router.push(`/chamados/${ticket.id}`)}
        >
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase tabular">
            #{ticket.protocol}
            {age ? <span className="ml-1.5 font-normal normal-case">{age}</span> : null}
          </p>
          <p className="mt-0.5 line-clamp-1 text-sm leading-snug font-medium text-foreground">{ticket.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{ticket.condominium.nome}</p>
          <p className="mt-0.5 flex items-center gap-2">
            <PriorityIndicator priority={ticket.priority} />
            <span className="truncate text-[11px] text-muted-foreground">{assignee}</span>
          </p>
          {ticket.nextDeadline ? (
            <p
              className={cn(
                "truncate text-[11px] tabular",
                isOverdue(ticket.nextDeadline.dueAt, ticket.nextDeadline.doneAt)
                  ? "text-[var(--danger)]"
                  : "text-muted-foreground",
              )}
            >
              Prazo {formatDue(ticket.nextDeadline.dueAt)}
            </p>
          ) : null}
        </button>
        <div className="flex shrink-0 flex-col items-center gap-0.5 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {showHandle ? (
            handle ?? (
              <span className="hidden text-muted-foreground md:inline" aria-hidden>
                <GripVertical className="size-3.5" />
              </span>
            )
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreHorizontal className="size-3.5" />
              <span className="sr-only">Ações do chamado #{ticket.protocol}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {TICKET_STATUSES.filter((s) => s !== ticket.status).map((s) => (
                <DropdownMenuItem key={s} disabled={moving} onClick={() => onMove(s)}>
                  Mover para {STATUS_LABEL[s]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => router.push(`/chamados/${ticket.id}`)}>
                Abrir ficha
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Link href={`/chamados/${ticket.id}`} className="sr-only">
        Abrir #{ticket.protocol}
      </Link>
    </article>
  );
}
