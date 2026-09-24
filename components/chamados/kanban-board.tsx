"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { TicketCard, type KanbanTicket } from "@/components/chamados/ticket-card";
import { STATUS_LABEL, STATUS_TONE, TICKET_STATUSES } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
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
  visibleStatus,
  dragEnabled = true,
}: {
  tickets: KanbanTicket[];
  onMove: (id: string, status: string) => void;
  movingId?: string | null;
  visibleStatus?: string | null;
  dragEnabled?: boolean;
}) {
  const grouped = useMemo(() => groupTickets(tickets), [tickets]);
  const [board, setBoard] = useState(grouped);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setBoard(grouped);
  }, [grouped]);

  const activeTicket =
    tickets.find((t) => t.id === activeId) ?? Object.values(board).flat().find((t) => t.id === activeId);

  return (
    <Kanban
      className="flex h-full min-h-0 flex-col"
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
      <ReuiKanbanBoard className="h-full min-h-0 !grid-cols-1 gap-2 overflow-x-auto md:!grid-cols-4 md:min-w-[56rem]">
        {TICKET_STATUSES.map((status) => {
          const columnTickets = board[status] ?? [];
          const hideOnMobile = Boolean(visibleStatus) && visibleStatus !== status;
          return (
            <KanbanColumn
              key={status}
              value={status}
              disabled
              className={cn("h-full min-h-0 !opacity-100", hideOnMobile && "max-md:hidden")}
            >
              <div
                className={cn(
                  "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border border-t-[3px]",
                  STATUS_TONE[status]?.column,
                  status === "aberto" && "border-t-[var(--status-aberto)]",
                  status === "em_andamento" && "border-t-[var(--status-andamento)]",
                  status === "aguardando" && "border-t-[var(--status-aguardando)]",
                  status === "resolvido" && "border-t-[var(--status-resolvido)]",
                )}
              >
                <header className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <h2
                    className={cn(
                      "text-[11px] font-semibold tracking-wider uppercase",
                      status === "aberto" && "text-[var(--status-aberto)]",
                      status === "em_andamento" && "text-[var(--status-andamento)]",
                      status === "aguardando" && "text-[var(--status-aguardando)]",
                      status === "resolvido" && "text-[var(--status-resolvido)]",
                    )}
                  >
                    {STATUS_LABEL[status]}
                  </h2>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular", STATUS_TONE[status]?.count)}>
                    {columnTickets.length}
                  </span>
                </header>
                <KanbanColumnContent
                  value={status}
                  className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5"
                >
                  {columnTickets.map((ticket) => (
                    <KanbanItem
                      key={ticket.id}
                      value={ticket.id}
                      disabled={movingId === ticket.id || !dragEnabled}
                    >
                      <TicketCard
                        ticket={ticket}
                        moving={movingId === ticket.id}
                        showHandle={dragEnabled}
                        handle={
                          dragEnabled ? (
                            <KanbanItemHandle className="hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex">
                              <GripVertical className="size-3.5" />
                              <span className="sr-only">Arrastar</span>
                            </KanbanItemHandle>
                          ) : undefined
                        }
                        onMove={(next) => onMove(ticket.id, next)}
                      />
                    </KanbanItem>
                  ))}
                </KanbanColumnContent>
              </div>
            </KanbanColumn>
          );
        })}
      </ReuiKanbanBoard>
      <KanbanOverlay>
        {activeTicket ? (
          <TicketCard ticket={activeTicket} moving showHandle={false} onMove={() => undefined} />
        ) : (
          <div className={cn("size-full min-h-12 rounded-md bg-muted")} />
        )}
      </KanbanOverlay>
    </Kanban>
  );
}
