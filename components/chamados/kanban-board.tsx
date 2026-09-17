"use client";

import { useState } from "react";
import { TicketCard, type KanbanTicket } from "@/components/chamados/ticket-card";
import { STATUS_LABEL, TICKET_STATUSES } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export function KanbanBoard({
  tickets,
  onMove,
  movingId,
}: {
  tickets: KanbanTicket[];
  onMove: (id: string, status: string) => void;
  movingId?: string | null;
}) {
  const [expandedByColumn, setExpandedByColumn] = useState<Record<string, string | null>>({});
  const [overColumn, setOverColumn] = useState<string | null>(null);

  return (
    <div className="mt-4 flex gap-3 overflow-x-auto pb-4 md:grid md:grid-cols-4 md:overflow-visible">
      {TICKET_STATUSES.map((status) => {
        const columnTickets = tickets.filter((t) => t.status === status);
        return (
          <section
            key={status}
            aria-label={STATUS_LABEL[status]}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverColumn(status);
            }}
            onDragLeave={() => setOverColumn((cur) => (cur === status ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              setOverColumn(null);
              const id = e.dataTransfer.getData("text/plain");
              const ticket = tickets.find((t) => t.id === id);
              if (!id || !ticket || ticket.status === status) return;
              onMove(id, status);
            }}
            className={cn(
              "flex w-[min(100%,16rem)] shrink-0 flex-col rounded-[12px] border border-[var(--border)] bg-[var(--page)]/60 md:w-auto",
              overColumn === status && "border-[var(--brand)]/40",
            )}
          >
            <header className="flex items-baseline justify-between px-3 py-2">
              <h2 className="text-sm font-medium">{STATUS_LABEL[status]}</h2>
              <span className="text-xs text-[var(--muted)]">{columnTickets.length}</span>
            </header>
            <div className="flex max-h-[min(70vh,36rem)] flex-col gap-2 overflow-y-auto p-2">
              {columnTickets.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-[var(--muted)]">Nenhum chamado</p>
              ) : (
                columnTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    expanded={expandedByColumn[status] === ticket.id}
                    moving={movingId === ticket.id}
                    onToggle={() =>
                      setExpandedByColumn((prev) => ({
                        ...prev,
                        [status]: prev[status] === ticket.id ? null : ticket.id,
                      }))
                    }
                    onMove={(next) => onMove(ticket.id, next)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
