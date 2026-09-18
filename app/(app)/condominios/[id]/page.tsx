"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Accordion } from "@/components/ui/accordion";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Drawer } from "@/components/ui/drawer";
import { api } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";

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
  const toast = useToast();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";
  const q = useQuery({ queryKey: ["condominium", id], queryFn: () => api<Condo>(`/api/condominiums/${id}`) });
  const audit = useQuery({
    queryKey: ["audit", "condominium", id],
    enabled: admin,
    queryFn: () => api<Audit[]>(`/api/audit?entityType=condominium&entityId=${id}`),
  });
  const [form, setForm] = useState<Partial<Condo> | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Condo["contacts"][number] | null>(null);
  const [cNome, setCNome] = useState("");
  const [phone, setPhone] = useState("");
  const [cargo, setCargo] = useState("");
  const [email, setEmail] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api(`/api/condominiums/${id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["condominium", id] }),
  });
  const saveContact = useMutation({
    mutationFn: () => {
      const body = { nome: cNome, phone, cargo: cargo || undefined, email: email || undefined, condominiumId: id };
      if (editingContact) {
        return api(`/api/contacts/${editingContact.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return api("/api/contacts", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      setContactOpen(false);
      setEditingContact(null);
      toast("Contato salvo");
      qc.invalidateQueries({ queryKey: ["condominium", id] });
      qc.invalidateQueries({ queryKey: ["condominiums"] });
    },
  });

  function openNewContact() {
    setEditingContact(null);
    setCNome("");
    setPhone("");
    setCargo("");
    setEmail("");
    setContactOpen(true);
  }

  function openEditContact(ct: Condo["contacts"][number]) {
    setEditingContact(ct);
    setCNome(ct.nome);
    setPhone(ct.phoneE164);
    setCargo(ct.cargo || "");
    setEmail(ct.email || "");
    setContactOpen(true);
  }

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
            <Frame>
              <FramePanel className="space-y-3 p-5">
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
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel>
                <FrameHeader>
                  <FrameTitle>Chamados</FrameTitle>
                </FrameHeader>
                <div className="px-4 pb-4">
              {c.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum chamado visível.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {c.tickets.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2">
                      <Link className="text-primary" href={`/chamados/${t.id}`}>
                        #{t.protocol}
                      </Link>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <StatusBadge status={t.status} />
                      <span className="text-muted-foreground">{t.assignedTo?.email || "sem responsável"}</span>
                    </li>
                  ))}
                </ul>
              )}
                </div>
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel>
                <FrameHeader>
                  <FrameTitle>Comunicações</FrameTitle>
                </FrameHeader>
                <div className="px-4 pb-4">
              {c.conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conversa visível.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {c.conversations.map((conv) => (
                    <li key={conv.id}>
                      {conv.contact?.nome || "contato"} · {conv.messages[0]?.body || "—"}
                    </li>
                  ))}
                </ul>
              )}
                </div>
              </FramePanel>
            </Frame>
          </div>
          <div className="space-y-4">
            <Frame>
              <FramePanel className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Contatos</h2>
                {admin ? (
                  <Button type="button" variant="secondary" size="sm" onClick={openNewContact}>
                    Adicionar
                  </Button>
                ) : null}
              </div>
              <ul className="mt-2 space-y-2 text-sm">
                {c.contacts.map((ct) => (
                  <li key={ct.id} className="flex items-start justify-between gap-2 rounded-[10px] bg-[var(--surface-2)] px-3 py-2">
                    <span>
                      {ct.nome} · {ct.phoneE164}
                      {ct.cargo ? ` · ${ct.cargo}` : ""}
                      {ct.email ? <span className="block text-xs text-muted-foreground">{ct.email}</span> : null}
                    </span>
                    {admin ? (
                      <button type="button" className="text-xs text-primary" onClick={() => openEditContact(ct)}>
                        Editar
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel>
                <FrameHeader>
                  <FrameTitle>Documentos</FrameTitle>
                </FrameHeader>
                <div className="px-4 pb-4">
              {c.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum arquivo visível.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {c.documents.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span>{d.originalName}</span>
                      <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                        Baixar
                      </a>
                    </li>
                  ))}
                </ul>
              )}
                </div>
              </FramePanel>
            </Frame>
            {admin ? (
              <Accordion title="Histórico">
                {(audit.data?.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem eventos.</p>
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
      <Drawer open={contactOpen} onClose={() => setContactOpen(false)} title={editingContact ? "Editar contato" : "Novo contato"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveContact.mutate();
          }}
        >
          <Label htmlFor="cn">Nome</Label>
          <Input id="cn" required value={cNome} onChange={(e) => setCNome(e.target.value)} />
          <Label htmlFor="ph">Telefone</Label>
          <Input id="ph" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Label htmlFor="cg">Cargo</Label>
          <Input id="cg" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <Label htmlFor="em">E-mail</Label>
          <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {saveContact.isError ? <p className="text-sm text-[var(--danger)]">{(saveContact.error as Error).message}</p> : null}
          <Button type="submit" disabled={saveContact.isPending}>
            Salvar contato
          </Button>
        </form>
      </Drawer>
    </div>
  );
}
