"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PriorityIndicator } from "@/components/ui/status-badge";
import { CATEGORY_LABEL, STATUS_LABEL, TICKET_STATUSES } from "@/lib/ui-labels";
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
}: {
  ticket: KanbanTicket;
  expanded: boolean;
  onToggle: () => void;
  onMove: (status: string) => void;
  moving?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const assignee = ticket.assignedTo?.nome || ticket.assignedTo?.email || "Sem responsável";

  return (
    <article
      draggable={!moving}
      onDragStart={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, select, input, label")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", ticket.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3 text-left shadow-[var(--shadow)]",
        dragging && "opacity-50",
        moving && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <PriorityIndicator priority={ticket.priority} />
        <span
          className="cursor-grab text-[var(--muted)] select-none"
          aria-hidden
          title="Arrastar"
        >
          ⋮⋮
        </span>
      </div>
      <p className="mt-1 font-medium">#{ticket.protocol}</p>
      <p className="line-clamp-2 text-sm text-[var(--muted)]">{ticket.title}</p>
      <p className="mt-2 truncate text-xs text-[var(--muted)]">{ticket.condominium.nome}</p>
      <p className="truncate text-xs text-[var(--muted)]">{assignee}</p>
      <button
        type="button"
        className="mt-2 text-sm text-[var(--brand)]"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {expanded ? "Recolher" : "Detalhes"}
      </button>
      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 text-sm">
          <p>
            <span className="text-[var(--muted)]">Categoria: </span>
            {CATEGORY_LABEL[ticket.category] || ticket.category}
          </p>
          <p>
            <span className="text-[var(--muted)]">Contato: </span>
            {ticket.contact.nome}
          </p>
          <p>
            <span className="text-[var(--muted)]">Responsável: </span>
            {assignee}
          </p>
          <p>
            <span className="text-[var(--muted)]">Status: </span>
            {STATUS_LABEL[ticket.status] || ticket.status}
          </p>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Mover para</span>
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
          <Link
            href={`/chamados/${ticket.id}`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full")}
          >
            Abrir ficha
          </Link>
        </div>
      ) : null}
    </article>
  );
}
