"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Ticket = {
  id: string;
  protocol: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  assignedTo: { email: string };
  condominium: { nome: string };
  contact: { nome: string };
};

type Condo = { id: string; nome: string };
type Contact = { id: string; nome: string };
type Member = { id: string; email: string; ativo: boolean };

export default function ChamadosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: { role: string } }>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";
  const list = useQuery({
    queryKey: ["tickets", q],
    queryFn: () => api<Ticket[]>(`/api/tickets?q=${encodeURIComponent(q)}`),
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
    mutationFn: () => api("/api/tickets", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  if (list.isError) {
    const status = (list.error as Error & { status?: number }).status;
    if (status === 403) return <p className="text-[var(--muted)]">Sem permissão.</p>;
    return <ErrorBanner message="Falha ao carregar chamados." onRetry={() => list.refetch()} />;
  }
  const items = list.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Chamados</h1>
          <p className="text-sm text-[var(--muted)]">
            Funcionário vê só os atribuídos. URL de chamado alheio retorna 403.
          </p>
        </div>
        {admin ? (
          <Button type="button" onClick={() => setOpen((v) => !v)}>
            {open ? "Fechar" : "+ Novo (manual)"}
          </Button>
        ) : null}
      </div>
      {open && admin ? (
        <Card>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="md:col-span-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="condo">Condomínio</Label>
              <select
                id="condo"
                required
                className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2.5 text-sm"
                value={form.condominiumId}
                onChange={(e) => setForm({ ...form, condominiumId: e.target.value })}
              >
                <option value="">Selecionar</option>
                {(condos.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="contact">Contato</Label>
              <select
                id="contact"
                required
                className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2.5 text-sm"
                value={form.contactId}
                onChange={(e) => setForm({ ...form, contactId: e.target.value })}
              >
                <option value="">Selecionar</option>
                {(contacts.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="asg">Responsável</Label>
              <select
                id="asg"
                required
                className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2.5 text-sm"
                value={form.assignedToId}
                onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
              >
                <option value="">Selecionar</option>
                {(team.data?.data ?? [])
                  .filter((m) => m.ativo)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.email}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={create.isPending}>
                Criar
              </Button>
            </div>
            {create.isError ? (
              <p className="md:col-span-2 text-sm text-[var(--danger)]">{(create.error as Error).message}</p>
            ) : null}
          </form>
        </Card>
      ) : null}
      <Input placeholder="Buscar protocolo, título…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar chamados" />
      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum chamado" hint="Admin promove na triagem ou cria manualmente." />
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/chamados/${t.id}`}>
                <Card className="flex flex-col gap-1 hover:bg-[var(--page)] md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">
                      #{t.protocol} · {t.title}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      {t.condominium.nome} · {t.contact.nome} · {t.assignedTo.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge>{t.status}</Badge>
                    <Badge tone="warn">{t.priority}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
