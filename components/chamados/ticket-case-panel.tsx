"use client";

import { CATEGORY_LABEL, formatWhen } from "@/lib/ui-labels";

export function TicketCasePanel({
  category,
  createdAt,
}: {
  category: string;
  createdAt?: string;
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
    </div>
  );
}
