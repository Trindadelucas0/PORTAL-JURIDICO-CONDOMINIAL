"use client";

import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, formatDue, formatWhen, isOverdue } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type CaseDeadline = {
  id: string;
  title: string;
  dueAt: string;
  doneAt: string | null;
};

export function TicketCasePanel({
  category,
  createdAt,
  deadlines,
  donePending,
  onAddDeadline,
  onCompleteDeadline,
}: {
  category: string;
  createdAt?: string;
  deadlines: CaseDeadline[];
  donePending?: boolean;
  onAddDeadline: () => void;
  onCompleteDeadline: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Categoria
          </dt>
          <dd className="mt-1">{CATEGORY_LABEL[category] || category}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Aberto em
          </dt>
          <dd className="mt-1 tabular-nums">{createdAt ? formatWhen(createdAt) : "—"}</dd>
        </div>
      </dl>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Prazos
          </h2>
          <Button type="button" size="sm" variant="secondary" onClick={onAddDeadline}>
            Adicionar prazo
          </Button>
        </div>
        {deadlines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum prazo neste chamado.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {deadlines.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{d.title}</span>
                  <span
                    className={cn(
                      "ml-2 tabular-nums text-xs",
                      isOverdue(d.dueAt, d.doneAt) ? "text-[var(--danger)]" : "text-muted-foreground",
                    )}
                  >
                    {formatDue(d.dueAt)}
                    {d.doneAt ? " · concluído" : ""}
                  </span>
                </span>
                {!d.doneAt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={donePending}
                    onClick={() => onCompleteDeadline(d.id)}
                  >
                    Concluir
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
