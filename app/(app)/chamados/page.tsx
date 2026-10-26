"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KanbanBoard } from "@/components/chamados/kanban-board";
import { TicketList } from "@/components/chamados/ticket-list";
import type { KanbanTicket } from "@/components/chamados/ticket-card";
import { TicketCreateDrawer, type CreateTicketValues } from "@/components/chamados/ticket-create-drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { ExpandableRow } from "@/components/ui/expandable-row";
import { api } from "@/lib/client/api";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, TICKET_STATUSES } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter } from "next/navigation";

type Condo = { id: string; nome: string };
type Member = { id: string; email: string; nome?: string; ativo: boolean };

type TicketsCache = { data: KanbanTicket[]; meta?: Record<string, number> };

function ChamadosInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const paramsQ = params.get("q") || "";
  const view = params.get("view") === "lista" ? "lista" : "quadro";
  const [q, setQ] = useState(paramsQ);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [unassigned, setUnassigned] = useState(params.get("unassigned") === "1");
  const [scope, setScope] = useState<"all" | "mine" | "unassigned">(
    params.get("unassigned") === "1" ? "unassigned" : "all",
  );
  const [mobileStatus, setMobileStatus] = useState<string>(TICKET_STATUSES[0]);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: { id: string; role: string } }>("/api/auth/me"),
  });
  const admin = me.data?.data.user.role === "admin";
  const myId = me.data?.data.user.id;

  function setView(next: "quadro" | "lista") {
    const sp = new URLSearchParams(params.toString());
    if (next === "lista") sp.set("view", "lista");
    else sp.delete("view");
    router.replace(sp.toString() ? `/chamados?${sp}` : "/chamados");
  }

  useEffect(() => {
    setQ(paramsQ);
  }, [paramsQ]);

  useEffect(() => {
    if (params.get("novo") !== "1" || !admin) return;
    setOpen(true);
    const sp = new URLSearchParams(params.toString());
    sp.delete("novo");
    router.replace(sp.toString() ? `/chamados?${sp}` : "/chamados");
  }, [params, admin, router]);

  const list = useQuery({
    queryKey: ["tickets", q, category, priority, assignee, unassigned, scope, myId],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("pageSize", "50");
      if (q) p.set("q", q);
      if (category) p.set("category", category);
      if (priority) p.set("priority", priority);
      if (assignee) p.set("assignedToId", assignee);
      if (unassigned) p.set("unassigned", "1");
      if (scope === "mine" && myId) p.set("assignedToId", myId);
      return api<KanbanTicket[]>(`/api/tickets?${p.toString()}`);
    },
  });
  const condos = useQuery({ queryKey: ["condominiums"], queryFn: () => api<Condo[]>("/api/condominiums"), enabled: admin });
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<Member[]>("/api/team"), enabled: admin });
  const create = useMutation({
    mutationFn: (values: CreateTicketValues) =>
      api<{ id: string }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ ...values, assignedToId: values.assignedToId || null }),
      }),
    onSuccess: (res) => {
      setOpen(false);
      toast("Chamado criado");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      router.push(`/chamados/${res.data.id}`);
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (list.isError) {
    const code = (list.error as Error & { status?: number }).status;
    if (code === 403) return <ForbiddenState />;
    return (
      <div className="p-4">
        <ErrorBanner message="Falha ao carregar chamados." onRetry={() => list.refetch()} />
      </div>
    );
  }
  const items = list.data?.data ?? [];
  const total = list.data?.meta?.total ?? items.length;
  const truncated = total > items.length;
  const unassignedCount = items.filter((t) => !t.assignedTo).length;
  const counts = TICKET_STATUSES.reduce(
    (acc, status) => {
      acc[status] = items.filter((t) => t.status === status).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-tour="chamados">
      <PageHeader
        className="mb-0 shrink-0"
        dense
        title="Chamados"
        description={
          list.isLoading
            ? "Carregando…"
            : `${total} no quadro${unassignedCount > 0 ? ` · ${unassignedCount} sem responsável` : ""}`
        }
        action={
          <div className="flex items-center gap-2" data-tour="chamados-visualizacao">
            <FilterBar>
              <FilterChip active={view === "quadro"} onClick={() => setView("quadro")}>
                Quadro
              </FilterChip>
              <FilterChip active={view === "lista"} onClick={() => setView("lista")}>
                Lista
              </FilterChip>
            </FilterBar>
            {admin ? (
              <Button type="button" onClick={() => setOpen(true)}>
                Novo chamado
              </Button>
            ) : null}
          </div>
        }
      />
      <FilterBar className="mb-2 shrink-0" data-tour="chamados-filtros">
        <FilterChip
          active={scope === "all"}
          onClick={() => {
            setScope("all");
            setUnassigned(false);
            setAssignee("");
          }}
        >
          Todos
        </FilterChip>
        <FilterChip
          active={scope === "mine"}
          onClick={() => {
            setScope("mine");
            setUnassigned(false);
            setAssignee("");
          }}
        >
          Meus
        </FilterChip>
        {admin ? (
          <FilterChip
            active={scope === "unassigned"}
            onClick={() => {
              setScope("unassigned");
              setUnassigned(true);
              setAssignee("");
            }}
          >
            Sem responsável
          </FilterChip>
        ) : null}
      </FilterBar>
      <ExpandableRow title="Filtros avançados" summary="Categoria, prioridade e responsável" className="mb-2 shrink-0">
        <Toolbar className="mb-0 border-0 py-0">
          <Input
            className="max-w-xs md:hidden"
            placeholder="Buscar protocolo, título…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar chamados"
          />
          <Select className="max-w-[12rem]" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
            <option value="">Categoria</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <Select className="max-w-[12rem]" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridade">
            <option value="">Prioridade</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
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
                  setScope("unassigned");
                } else {
                  setUnassigned(false);
                  setAssignee(e.target.value);
                  setScope(e.target.value ? "all" : "all");
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
        </Toolbar>
      </ExpandableRow>
      <FilterBar className="mb-2 shrink-0 md:hidden">
        {TICKET_STATUSES.map((status) => (
          <FilterChip
            key={status}
            active={mobileStatus === status}
            count={counts[status] ?? 0}
            onClick={() => setMobileStatus(status)}
          >
            {STATUS_LABEL[status]}
          </FilterChip>
        ))}
      </FilterBar>
      {truncated ? (
        <p className="mb-2 shrink-0 text-sm text-muted-foreground" role="status">
          Exibindo {items.length} de {total} chamados (limite de 50). Refine a busca ou os filtros para ver os demais.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden" data-tour="chamados-conteudo">
        {list.isLoading ? (
          <div className="grid h-full gap-2 md:grid-cols-4">
            <Skeleton className="h-full min-h-40" />
            <Skeleton className="h-full min-h-40" />
            <Skeleton className="h-full min-h-40" />
            <Skeleton className="h-full min-h-40" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhum chamado"
            hint="Admin promove na triagem ou cria manualmente."
            action={admin ? { label: "Criar chamado", onClick: () => setOpen(true) } : undefined}
          />
        ) : view === "lista" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TicketList tickets={items} emptyHint="Admin promove na triagem ou cria manualmente." />
          </div>
        ) : (
          <KanbanBoard
            tickets={items}
            onMove={(id, status) => move.mutate({ id, status })}
            movingId={move.isPending ? move.variables?.id : null}
            visibleStatus={isMobile ? mobileStatus : null}
            dragEnabled={!isMobile}
          />
        )}
      </div>
      <TicketCreateDrawer
        open={open}
        onClose={() => setOpen(false)}
        condos={condos.data?.data ?? []}
        team={team.data?.data ?? []}
        pending={create.isPending}
        errorMessage={create.isError ? (create.error as Error).message : null}
        onCreate={(values) => create.mutate(values)}
      />
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
