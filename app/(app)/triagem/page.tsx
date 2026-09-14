"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Item = {
  id: string;
  status: string;
  updatedAt: string;
  conversation: {
    unidentified: boolean;
    contact: { nome: string; phoneE164: string; condominiumId?: string | null } | null;
    condominium: { nome: string } | null;
    messages: { body: string; createdAt: string }[];
  };
};

type Member = { id: string; email: string; role: string; ativo: boolean };

const CATEGORIES = ["cobranca", "assembleia", "obras", "vizinhanca", "administrativo", "outro"] as const;
const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;

export default function TriagemPage() {
  const qc = useQueryClient();
  const [contactByItem, setContactByItem] = useState<Record<string, string>>({});
  const [promo, setPromo] = useState<Record<string, { category: string; priority: string; assignedToId: string }>>({});
  const q = useQuery({ queryKey: ["triage"], queryFn: () => api<Item[]>("/api/triage") });
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api<Array<{ id: string; nome: string }>>("/api/contacts"),
  });
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<Member[]>("/api/team") });
  const patch = useMutation({
    mutationFn: (payload: { id: string; body: unknown }) =>
      api(`/api/triage/${payload.id}`, { method: "PATCH", body: JSON.stringify(payload.body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["triage"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  if (q.isError) {
    const status = (q.error as Error & { status?: number }).status;
    if (status === 403) {
      return (
        <div>
          <h1 className="font-display text-3xl">Triagem</h1>
          <p className="mt-4 text-[var(--muted)]">Sem permissão.</p>
        </div>
      );
    }
    return <ErrorBanner message="Falha ao carregar triagem." onRetry={() => q.refetch()} />;
  }

  const items = q.data?.data ?? [];
  const members = (team.data?.data ?? []).filter((m) => m.ativo);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Triagem</h1>
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState title="Nada na triagem" hint="Inbounds abrem um item aqui. Chamado só após promover." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const p = promo[item.id] || { category: "outro", priority: "media", assignedToId: "" };
            const unidentified = item.conversation.unidentified;
            return (
              <Card key={item.id} className="space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-medium">
                      {item.conversation.condominium?.nome || "sem condomínio"} —{" "}
                      {unidentified ? "não identificado" : item.conversation.contact?.nome || "Contato"}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{item.conversation.messages[0]?.body || "—"}</p>
                    <Badge tone="warn">{item.status}</Badge>
                  </div>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ id: item.id, body: { action: "archive" } })}
                  >
                    Arquivar
                  </Button>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
                  <div>
                    <Label htmlFor={`c-${item.id}`}>Contato</Label>
                    <select
                      id={`c-${item.id}`}
                      className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2 text-sm md:w-56"
                      value={contactByItem[item.id] || ""}
                      onChange={(e) => setContactByItem((s) => ({ ...s, [item.id]: e.target.value }))}
                    >
                      <option value="">Identificar contato</option>
                      {(contacts.data?.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      disabled={!contactByItem[item.id] || patch.isPending}
                      onClick={() =>
                        patch.mutate({
                          id: item.id,
                          body: { action: "identify", contactId: contactByItem[item.id] },
                        })
                      }
                    >
                      Identificar
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
                  <div>
                    <Label htmlFor={`cat-${item.id}`}>Categoria</Label>
                    <select
                      id={`cat-${item.id}`}
                      className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2 text-sm"
                      value={p.category}
                      onChange={(e) => setPromo((s) => ({ ...s, [item.id]: { ...p, category: e.target.value } }))}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`pri-${item.id}`}>Prioridade</Label>
                    <select
                      id={`pri-${item.id}`}
                      className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2 text-sm"
                      value={p.priority}
                      onChange={(e) => setPromo((s) => ({ ...s, [item.id]: { ...p, priority: e.target.value } }))}
                    >
                      {PRIORITIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`as-${item.id}`}>Responsável</Label>
                    <select
                      id={`as-${item.id}`}
                      className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2 text-sm md:w-56"
                      value={p.assignedToId}
                      onChange={(e) => setPromo((s) => ({ ...s, [item.id]: { ...p, assignedToId: e.target.value } }))}
                    >
                      <option value="">Selecionar</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    disabled={unidentified || !p.assignedToId || patch.isPending}
                    onClick={() =>
                      patch.mutate({
                        id: item.id,
                        body: {
                          action: "promote",
                          category: p.category,
                          priority: p.priority,
                          assignedToId: p.assignedToId,
                        },
                      })
                    }
                  >
                    Promover a chamado
                  </Button>
                </div>
                {unidentified ? (
                  <p className="text-xs text-[var(--muted)]">Identifique o contato (com condomínio) antes de promover.</p>
                ) : null}
                {patch.isError ? <p className="text-sm text-[var(--danger)]">{(patch.error as Error).message}</p> : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
