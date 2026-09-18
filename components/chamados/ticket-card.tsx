"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PriorityIndicator } from "@/components/ui/status-badge";
import { CATEGORY_LABEL, PRIORITY_TONE, STATUS_LABEL, TICKET_STATUSES, initials } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type KanbanTicket = {
  id: string;
  protocol: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  assignedTo: { email: string; nome?: string } | null;
  condominium: { nome: string };
  contact: { nome: string };
};

export function TicketCard({
  ticket,
  expanded,
  onToggle,
  onMove,
  moving,
  handle,
}: {
  ticket: KanbanTicket;
  expanded: boolean;
  onToggle: () => void;
  onMove: (status: string) => void;
  moving?: boolean;
  handle?: ReactNode;
}) {
  const assignee = ticket.assignedTo?.nome || ticket.assignedTo?.email || "Sem responsável";
  const priorityBar = PRIORITY_TONE[ticket.priority]?.bar ?? PRIORITY_TONE.media.bar;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[12px] border border-border bg-card p-3 pl-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]",
        moving && "opacity-60",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", priorityBar)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium tabular">#{ticket.protocol}</p>
        {handle ?? (
          <span className="text-muted-foreground" aria-hidden title="Arrastar">
            <GripVertical className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium">{ticket.title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {CATEGORY_LABEL[ticket.category] || ticket.category}
        </span>
        <PriorityIndicator priority={ticket.priority} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{ticket.condominium.nome}</p>
        <Avatar className="size-6" title={assignee}>
          <AvatarFallback className="bg-primary text-[9px] text-primary-foreground">{initials(assignee)}</AvatarFallback>
        </Avatar>
      </div>
      <button type="button" className="mt-2 text-sm text-primary" aria-expanded={expanded} onClick={onToggle}>
        {expanded ? "Recolher" : "Detalhes"}
      </button>
      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <p>
            <span className="text-muted-foreground">Categoria: </span>
            {CATEGORY_LABEL[ticket.category] || ticket.category}
          </p>
          <p>
            <span className="text-muted-foreground">Contato: </span>
            {ticket.contact.nome}
          </p>
          <p>
            <span className="text-muted-foreground">Responsável: </span>
            {assignee}
          </p>
          <p>
            <span className="text-muted-foreground">Status: </span>
            {STATUS_LABEL[ticket.status] || ticket.status}
          </p>
          <label className="block">
            <span className="text-xs text-muted-foreground">Mover para</span>
            <Select
              className="mt-1"
              aria-label="Mover para"
              value={ticket.status}
              disabled={moving}
              onChange={(e) => {
                if (e.target.value !== ticket.status) onMove(e.target.value);
              }}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </label>
          <Link href={`/chamados/${ticket.id}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full")}>
            Abrir ficha
          </Link>
        </div>
      ) : null}
    </article>
  );
}
