"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KanbanBoard } from "@/components/chamados/kanban-board";
import type { KanbanTicket } from "@/components/chamados/ticket-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/client/api";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";

type Condo = { id: string; nome: string };
type Contact = { id: string; nome: string };
type Member = { id: string; email: string; nome?: string; ativo: boolean };

type TicketsCache = { data: KanbanTicket[]; meta?: Record<string, number> };

function ChamadosInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [unassigned, setUnassigned] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: { role: string } }>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";
  const list = useQuery({
    queryKey: ["tickets", q, category, assignee, unassigned],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("pageSize", "50");
      if (q) p.set("q", q);
      if (category) p.set("category", category);
      if (assignee) p.set("assignedToId", assignee);
      if (unassigned) p.set("unassigned", "1");
      return api<KanbanTicket[]>(`/api/tickets?${p.toString()}`);
    },
  });
  const condos = useQuery({ queryKey: ["condominiums"], queryFn: () => api<Condo[]>("/api/condominiums"), enabled: admin });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: () => api<Contact[]>("/api/contacts"), enabled: admin });
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<Member[]>("/api/team"), enabled: admin });
  const [form, setForm] = useState({
    title: "",
    category: "outro",
    priority: "media",
    condominiumId: "",
    contactId: "",
    assignedToId: "",
  });
  const create = useMutation({
    mutationFn: () =>
      api("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ ...form, assignedToId: form.assignedToId || null }),
      }),
    onSuccess: () => {
      setOpen(false);
      toast("Chamado criado");
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["tickets"] });
      const previous = qc.getQueriesData<TicketsCache>({ queryKey: ["tickets"] });
      qc.setQueriesData<TicketsCache>({ queryKey: ["tickets"] }, (old) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((t) => (t.id === id ? { ...t, status } : t)) };
      });
      return { previous };
    },
    onError: (error, _vars, ctx) => {
      ctx?.previous.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
      toast((error as Error).message || "Não foi possível mover o chamado");
    },
    onSuccess: () => toast("Status atualizado"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });

  if (list.isError) {
    const code = (list.error as Error & { status?: number }).status;
    if (code === 403) return <ForbiddenState />;
    return <ErrorBanner message="Falha ao carregar chamados." onRetry={() => list.refetch()} />;
  }
  const items = list.data?.data ?? [];
  const total = list.data?.meta?.total ?? items.length;
  const truncated = total > items.length;

  return (
    <div>
      <PageHeader
        title="Chamados"
        description={`${total} chamados`}
        action={
          admin ? (
            <Button type="button" onClick={() => setOpen(true)}>
              Novo chamado
            </Button>
          ) : null
        }
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar protocolo, título…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar chamados" />
        <Select className="max-w-[12rem]" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
          <option value="">Categoria</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        {admin ? (
          <Select
            className="max-w-[12rem]"
            value={unassigned ? "unassigned" : assignee}
            onChange={(e) => {
              if (e.target.value === "unassigned") {
                setUnassigned(true);
                setAssignee("");
              } else {
                setUnassigned(false);
                setAssignee(e.target.value);
              }
            }}
            aria-label="Responsável"
          >
            <option value="">Responsável</option>
            <option value="unassigned">Sem responsável</option>
            {(team.data?.data ?? [])
              .filter((m) => m.ativo)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome || m.email}
                </option>
              ))}
          </Select>
        ) : null}
      </div>
      {truncated ? (
        <p className="mt-3 text-sm text-[var(--muted)]" role="status">
          Exibindo {items.length} de {total} chamados (limite de 50). Refine a busca ou os filtros para ver os demais.
        </p>
      ) : null}
      {list.isLoading ? (
        <Skeleton className="mt-4 h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum chamado"
          hint="Admin promove na triagem ou cria manualmente."
          action={admin ? { label: "Criar chamado", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <KanbanBoard tickets={items} onMove={(id, status) => move.mutate({ id, status })} movingId={move.isPending ? move.variables?.id : null} />
      )}
      <Drawer open={open} onClose={() => setOpen(false)} title="Novo chamado">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="condo">Condomínio</Label>
            <Select id="condo" required value={form.condominiumId} onChange={(e) => setForm({ ...form, condominiumId: e.target.value })}>
              <option value="">Selecionar</option>
              {(condos.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="contact">Contato</Label>
            <Select id="contact" required value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
              <option value="">Selecionar</option>
              {(contacts.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="asg">Responsável</Label>
            <Select id="asg" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
              <option value="">Sem responsável</option>
              {(team.data?.data ?? [])
                .filter((m) => m.ativo)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome || m.email}
                  </option>
                ))}
            </Select>
          </div>
          {create.isError ? <p className="text-sm text-[var(--danger)]">{(create.error as Error).message}</p> : null}
          <Button type="submit" disabled={create.isPending}>
            Criar
          </Button>
        </form>
      </Drawer>
    </div>
  );
}

export default function ChamadosPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <ChamadosInner />
    </Suspense>
  );
}
