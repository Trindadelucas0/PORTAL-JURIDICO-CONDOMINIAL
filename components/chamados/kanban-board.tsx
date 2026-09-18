"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Inbox } from "lucide-react";
import { TicketCard, type KanbanTicket } from "@/components/chamados/ticket-card";
import { STATUS_LABEL, STATUS_TONE, TICKET_STATUSES } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/reui/icon-tile";
import {
  Kanban,
  KanbanBoard as ReuiKanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban";

function groupTickets(tickets: KanbanTicket[]): Record<string, KanbanTicket[]> {
  const next: Record<string, KanbanTicket[]> = {};
  for (const status of TICKET_STATUSES) next[status] = [];
  for (const ticket of tickets) {
    if (next[ticket.status]) next[ticket.status].push(ticket);
    else next[TICKET_STATUSES[0]].push(ticket);
  }
  return next;
}

export function KanbanBoard({
  tickets,
  onMove,
  movingId,
}: {
  tickets: KanbanTicket[];
  onMove: (id: string, status: string) => void;
  movingId?: string | null;
}) {
  const grouped = useMemo(() => groupTickets(tickets), [tickets]);
  const [board, setBoard] = useState(grouped);
  const [expandedByColumn, setExpandedByColumn] = useState<Record<string, string | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setBoard(grouped);
  }, [grouped]);

  const activeTicket =
    tickets.find((t) => t.id === activeId) ?? Object.values(board).flat().find((t) => t.id === activeId);

  return (
    <Kanban
      value={board}
      onValueChange={setBoard}
      getItemValue={(item) => item.id}
      restoreOnCancel
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragEnd={() => setActiveId(null)}
      onDragCancel={() => setActiveId(null)}
      onValueCommit={(_next, meta) => {
        if (meta.kind !== "item") {
          setBoard(grouped);
          return;
        }
        const id = String(meta.event.active.id);
        if (!meta.overContainer || meta.activeContainer === meta.overContainer) return;
        onMove(id, meta.overContainer);
      }}
    >
      <ReuiKanbanBoard className="mt-1 !grid-cols-1 gap-4 overflow-x-auto md:!grid-cols-4">
        {TICKET_STATUSES.map((status) => {
          const columnTickets = board[status] ?? [];
          const tone = STATUS_TONE[status] ?? STATUS_TONE.arquivado;
          return (
            <KanbanColumn key={status} value={status} disabled>
              <div className="flex h-full min-h-[16rem] flex-col overflow-hidden rounded-[12px] border border-border bg-[var(--surface-2)] shadow-[var(--shadow-sm)]">
                <div className={cn("h-[3px] w-full", tone.bar)} />
                <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <h2 className="text-sm font-semibold">{STATUS_LABEL[status]}</h2>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular", tone.pill)}>
                    {columnTickets.length}
                  </span>
                </header>
                <KanbanColumnContent
                  value={status}
                  className="flex max-h-[min(70vh,36rem)] flex-col gap-3 overflow-y-auto p-2"
                >
                  {columnTickets.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-1 py-8 text-center">
                      <IconTile variant="frame" size="sm">
                        <Inbox />
                      </IconTile>
                      <p className="text-sm text-muted-foreground">Nenhum chamado</p>
                    </div>
                  ) : (
                    columnTickets.map((ticket) => (
                      <KanbanItem key={ticket.id} value={ticket.id} disabled={movingId === ticket.id}>
                        <TicketCard
                          ticket={ticket}
                          expanded={expandedByColumn[status] === ticket.id}
                          moving={movingId === ticket.id}
                          handle={
                            <KanbanItemHandle className="text-muted-foreground">
                              <GripVertical className="size-4" />
                              <span className="sr-only">Arrastar</span>
                            </KanbanItemHandle>
                          }
                          onToggle={() =>
                            setExpandedByColumn((prev) => ({
                              ...prev,
                              [status]: prev[status] === ticket.id ? null : ticket.id,
                            }))
                          }
                          onMove={(next) => onMove(ticket.id, next)}
                        />
                      </KanbanItem>
                    ))
                  )}
                </KanbanColumnContent>
              </div>
            </KanbanColumn>
          );
        })}
      </ReuiKanbanBoard>
      <KanbanOverlay>
        {activeTicket ? (
          <TicketCard ticket={activeTicket} expanded={false} moving onToggle={() => undefined} onMove={() => undefined} />
        ) : (
          <div className="size-full min-h-16 rounded-md bg-muted" />
        )}
      </KanbanOverlay>
    </Kanban>
  );
}
