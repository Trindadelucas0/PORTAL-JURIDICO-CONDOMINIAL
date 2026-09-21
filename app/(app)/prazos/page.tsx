"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { api } from "@/lib/client/api";
import { formatDue, formatWhen, isOverdue, STATUS_LABEL } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type Deadline = {
  id: string;
  title: string;
  dueAt: string;
  doneAt: string | null;
  kind: string;
  ticket: { id: string; protocol: string; title: string; status: string };
};

type Filter = "all" | "today" | "soon" | "overdue";

function isSameDay(iso: string) {
  const a = new Date(iso);
  const b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function PrazosInner() {
  const params = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const initial: Filter =
    params.get("overdue") === "1" ? "overdue" : params.get("dueSoon") === "1" ? "soon" : "all";
  const [filter, setFilter] = useState<Filter>(initial);
  const list = useQuery({
    queryKey: ["deadlines", filter === "soon" || filter === "overdue" ? filter : "all"],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("pageSize", "50");
      if (filter === "overdue") p.set("overdue", "1");
      if (filter === "soon") p.set("dueSoon", "1");
      return api<Deadline[]>(`/api/deadlines?${p.toString()}`);
    },
  });
  const done = useMutation({
    mutationFn: (id: string) => api(`/api/deadlines/${id}`, { method: "PATCH", body: JSON.stringify({ done: true }) }),
    onSuccess: () => {
      toast("Prazo concluído");
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const items = useMemo(() => {
    const rows = list.data?.data ?? [];
    if (filter === "today") return rows.filter((d) => !d.doneAt && isSameDay(d.dueAt));
    return rows;
  }, [list.data, filter]);

  if (list.isError) {
    const status = (list.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState />;
    return (
      <div className="p-4">
        <ErrorBanner message="Falha ao carregar prazos." onRetry={() => list.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">Prazos</h1>
          <p className="text-xs text-muted-foreground">Datas internas do chamado. Não é prazo processual oficial.</p>
        </div>
        <FilterBar className="ml-auto">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            Todos
          </FilterChip>
          <FilterChip active={filter === "today"} onClick={() => setFilter("today")}>
            Hoje
          </FilterChip>
          <FilterChip active={filter === "soon"} onClick={() => setFilter("soon")}>
            Próximos
          </FilterChip>
          <FilterChip active={filter === "overdue"} onClick={() => setFilter("overdue")}>
            Atrasados
          </FilterChip>
        </FilterBar>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {list.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum prazo neste filtro" hint="Adicione prazos na ficha do chamado." />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span
                  className={cn(
                    "w-24 shrink-0 tabular text-xs",
                    isOverdue(d.dueAt, d.doneAt) ? "font-medium text-[var(--danger)]" : "text-muted-foreground",
                  )}
                >
                  {formatDue(d.dueAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{d.title}</span>
                  <Link href={`/chamados/${d.ticket.id}`} className="text-xs text-[var(--brand)]">
                    #{d.ticket.protocol} · {d.ticket.title}
                  </Link>
                </span>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[d.ticket.status] || d.ticket.status}</span>
                {d.doneAt ? (
                  <span className="text-xs text-muted-foreground">Concluído {formatWhen(d.doneAt)}</span>
                ) : (
                  <Button type="button" size="sm" variant="ghost" disabled={done.isPending} onClick={() => done.mutate(d.id)}>
                    Concluir
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function PrazosPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <PrazosInner />
    </Suspense>
  );
}
