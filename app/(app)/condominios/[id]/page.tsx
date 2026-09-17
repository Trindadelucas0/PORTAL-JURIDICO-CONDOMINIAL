"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Accordion } from "@/components/ui/accordion";
import { api } from "@/lib/client/api";

type Condo = {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  cidadeUf: string | null;
  observacao: string | null;
  contacts: Array<{ id: string; nome: string; phoneE164: string; email: string | null; cargo: string | null }>;
  tickets: Array<{
    id: string;
    protocol: string;
    title: string;
    status: string;
    priority: string;
    assignedTo: { email: string; nome: string } | null;
  }>;
  documents: Array<{ id: string; originalName: string; sizeBytes: number; ingestStatus: string; storageKey: string }>;
  conversations: Array<{
    id: string;
    contact: { nome: string } | null;
    messages: Array<{ body: string; createdAt: string }>;
  }>;
};

type Audit = {
  id: string;
  action: string;
  createdAt: string;
  actor: { email: string; nome: string };
  beforeJson: unknown;
  afterJson: unknown;
};

type Me = { user: { role: string } };

export default function CondominioFichaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";
  const q = useQuery({ queryKey: ["condominium", id], queryFn: () => api<Condo>(`/api/condominiums/${id}`) });
  const audit = useQuery({
    queryKey: ["audit", "condominium", id],
    enabled: admin,
    queryFn: () => api<Audit[]>(`/api/audit?entityType=condominium&entityId=${id}`),
  });
  const [form, setForm] = useState<Partial<Condo> | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/condominiums/${id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["condominium", id] }),
  });

  if (q.isError) {
    const status = (q.error as Error & { status?: number }).status;
    if (status === 404) return <p className="text-[var(--muted)]">Condomínio não encontrado.</p>;
    return <ErrorBanner message="Falha ao carregar ficha." onRetry={() => q.refetch()} />;
  }
  const c = q.data?.data;
  const data = form ?? c;

  return (
    <div>
      <PageHeader
        back={
          <Link href="/condominios" className="text-sm text-[var(--brand)]">
            ← Condomínios
          </Link>
        }
        title={c?.nome || "Condomínio"}
        description={c?.cidadeUf || undefined}
      />
      {q.isLoading || !c || !data ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" disabled={!admin} value={data.nome || ""} onChange={(e) => setForm({ ...data, nome: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input id="cnpj" disabled={!admin} value={data.cnpj || ""} onChange={(e) => setForm({ ...data, cnpj: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="end">Endereço</Label>
                  <Input id="end" disabled={!admin} value={data.endereco || ""} onChange={(e) => setForm({ ...data, endereco: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="cid">Cidade/UF</Label>
                  <Input id="cid" disabled={!admin} value={data.cidadeUf || ""} onChange={(e) => setForm({ ...data, cidadeUf: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="obs">Observação</Label>
                  <Input id="obs" disabled={!admin} value={data.observacao || ""} onChange={(e) => setForm({ ...data, observacao: e.target.value })} />
                </div>
              </div>
              {admin ? (
                <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
                  Salvar cadastro
                </Button>
              ) : null}
              {save.isError ? <p className="text-sm text-[var(--danger)]">{(save.error as Error).message}</p> : null}
            </section>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Chamados</h2>
              {c.tickets.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Nenhum chamado visível.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {c.tickets.map((t) => (
                    <li key={t.id}>
                      <Link className="text-[var(--brand)]" href={`/chamados/${t.id}`}>
                        #{t.protocol}
                      </Link>{" "}
                      {t.title} <Badge>{t.status}</Badge> {t.assignedTo?.email || "sem responsável"}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Comunicações</h2>
              {c.conversations.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Nenhuma conversa visível.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {c.conversations.map((conv) => (
                    <li key={conv.id}>
                      {conv.contact?.nome || "contato"} · {conv.messages[0]?.body || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <div className="space-y-6 lg:border-l lg:border-[var(--border)] lg:pl-6">
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Contatos</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {c.contacts.map((ct) => (
                  <li key={ct.id}>
                    {ct.nome} · {ct.phoneE164}
                    {ct.cargo ? ` · ${ct.cargo}` : ""}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Documentos</h2>
              {c.documents.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Nenhum arquivo visível.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {c.documents.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span>{d.originalName}</span>
                      <a className="text-[var(--brand)]" href={`/api/files/${d.storageKey}`}>
                        Baixar
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {admin ? (
              <Accordion title="Histórico">
                {(audit.data?.data ?? []).length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Sem eventos.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {(audit.data?.data ?? []).map((a) => (
                      <li key={a.id}>
                        {new Date(a.createdAt).toLocaleString("pt-BR")} · {a.actor.email} · {a.action}
                      </li>
                    ))}
                  </ul>
                )}
              </Accordion>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
