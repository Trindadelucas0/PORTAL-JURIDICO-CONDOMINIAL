"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Drawer } from "@/components/ui/drawer";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client/api";
import { formatWhen } from "@/lib/ui-labels";

type Deadline = {
  id: string;
  title: string;
  dueAt: string;
  doneAt: string | null;
  kind: string;
  ticket: { id: string; protocol: string; title: string };
};

function PrazosInner() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const initial = params.get("overdue") === "1" ? "overdue" : "all";
  const [bucket, setBucket] = useState<"all" | "overdue" | "soon" | "done">(initial);
  const [q, setQ] = useState(params.get("q") || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [now] = useState(() => Date.now());
  const list = useQuery({
    queryKey: ["deadlines", bucket],
    queryFn: () => {
      const p = new URLSearchParams();
      if (bucket === "overdue") p.set("overdue", "1");
      if (bucket === "soon") p.set("dueSoon", "1");
      return api<Deadline[]>(`/api/deadlines?${p.toString()}`);
    },
  });
  const tickets = useQuery({
    queryKey: ["tickets"],
    queryFn: () => api<Array<{ id: string; protocol: string; title: string }>>("/api/tickets"),
    enabled: createOpen,
  });
  const done = useMutation({
    mutationFn: (id: string) => api(`/api/deadlines/${id}`, { method: "PATCH", body: JSON.stringify({ done: true }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
  });
  const create = useMutation({
    mutationFn: () =>
      api("/api/deadlines", {
        method: "POST",
        body: JSON.stringify({ ticketId, title, dueAt: new Date(dueAt).toISOString(), kind: "atendimento" }),
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setTitle("");
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    },
  });

  if (list.isError) return <ErrorBanner message="Falha ao carregar prazos." onRetry={() => list.refetch()} />;
  let items = list.data?.data ?? [];
  if (bucket === "done") items = items.filter((d) => d.doneAt);
  if (q.trim()) {
    const s = q.toLowerCase();
    items = items.filter((d) => `${d.title} ${d.ticket.protocol}`.toLowerCase().includes(s));
  }

  return (
    <div>
      <PageHeader
        title="Prazos"
        description="Controle operacional do escritório"
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Novo prazo
          </Button>
        }
      />
      <FilterBar>
        <FilterChip active={bucket === "all"} onClick={() => setBucket("all")}>
          Todos
        </FilterChip>
        <FilterChip active={bucket === "overdue"} onClick={() => setBucket("overdue")}>
          Vencidos
        </FilterChip>
        <FilterChip active={bucket === "soon"} onClick={() => setBucket("soon")}>
          Próximos
        </FilterChip>
        <FilterChip active={bucket === "done"} onClick={() => setBucket("done")}>
          Concluídos
        </FilterChip>
      </FilterBar>
      <Input className="mt-4 max-w-sm" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar prazos" />
      {list.isLoading ? (
        <Skeleton className="mt-4 h-40" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum prazo" hint="Cadastre prazos na ficha do chamado." />
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)]">
          {items.map((d) => {
            const overdue = !d.doneAt && new Date(d.dueAt).getTime() < now;
            return (
              <li key={d.id} className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {d.doneAt ? "Concluído" : overdue ? "Vencido" : "Próximo"}
                  </p>
                  <p className="font-medium">{d.title}</p>
                  <p className="text-sm text-[var(--muted)]">
                    <Link className="text-[var(--brand)]" href={`/chamados/${d.ticket.id}`}>
                      #{d.ticket.protocol}
                    </Link>{" "}
                    · {formatWhen(d.dueAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!d.doneAt ? (
                    <Button type="button" variant="secondary" disabled={done.isPending} onClick={() => done.mutate(d.id)}>
                      Concluir
                    </Button>
                  ) : null}
                  <Link href={`/chamados/${d.ticket.id}`} className={buttonVariants({ variant: "ghost" })}>
                    Abrir
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Novo prazo">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <Label htmlFor="tk">Chamado</Label>
            <Select id="tk" required value={ticketId} onChange={(e) => setTicketId(e.target.value)}>
              <option value="">Selecionar</option>
              {(tickets.data?.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.protocol} {t.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tt">Título</Label>
            <Input id="tt" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="due">Vencimento</Label>
            <Input id="due" type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          {create.isError ? <p className="text-sm text-[var(--danger)]">{(create.error as Error).message}</p> : null}
          <Button type="submit" disabled={create.isPending}>
            Salvar
          </Button>
        </form>
      </Drawer>
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
