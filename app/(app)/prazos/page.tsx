"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";

type Deadline = {
  id: string;
  title: string;
  dueAt: string;
  doneAt: string | null;
  kind: string;
  ticket: { id: string; protocol: string; title: string };
};

export default function PrazosPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["deadlines"], queryFn: () => api<Deadline[]>("/api/deadlines") });
  const done = useMutation({
    mutationFn: (id: string) => api(`/api/deadlines/${id}`, { method: "PATCH", body: JSON.stringify({ done: true }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
  });

  const [now] = useState(() => Date.now());

  if (q.isError) return <ErrorBanner message="Falha ao carregar prazos." onRetry={() => q.refetch()} />;
  const items = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl">Prazos</h1>
        <p className="text-sm text-[var(--muted)]">
          Controle operacional. Sem cálculo oficial de prazo processual.
        </p>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum prazo" hint="Cadastre prazos na ficha do chamado." />
      ) : (
        <ul className="space-y-2">
          {items.map((d) => {
            const overdue = !d.doneAt && new Date(d.dueAt).getTime() < now;
            return (
              <li key={d.id}>
                <Card className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="text-sm text-[var(--muted)]">
                      <Link className="text-[var(--brand)]" href={`/chamados/${d.ticket.id}`}>
                        #{d.ticket.protocol}
                      </Link>{" "}
                      · {new Date(d.dueAt).toLocaleString("pt-BR")} · {d.kind}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.doneAt ? <Badge tone="ok">concluído</Badge> : overdue ? <Badge tone="danger">vencido</Badge> : <Badge>aberto</Badge>}
                    {!d.doneAt ? (
                      <Button type="button" variant="secondary" disabled={done.isPending} onClick={() => done.mutate(d.id)}>
                        Concluir
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
