"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabPanel, SectionTabs } from "@/components/ui/section-tabs";
import { ExpandableRow } from "@/components/ui/expandable-row";
import { Drawer } from "@/components/ui/drawer";
import { api } from "@/lib/client/api";
import { documentKindLabel } from "@/lib/documents/kinds";
import { formatWhatsAppPeer } from "@/lib/phone/display";
import { PhoneInput } from "@/components/ui/phone-input";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { peerAvatarPublicUrl } from "@/lib/phone/avatar-url";
import { e164ToMaskedInput } from "@/lib/phone/mask";
import { useToast } from "@/components/ui/toast";
import { ContactCondominiumPicker, fetchAllCondominiums } from "@/components/cadastro/contact-condominium-picker";
import { AiContactMemory } from "@/components/contatos/ai-contact-memory";

type Condo = {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  cidadeUf: string | null;
  observacao: string | null;
  contacts: Array<{
    id: string;
    nome: string;
    phoneE164: string;
    email: string | null;
    cargo: string | null;
    avatarKey?: string | null;
    condominiumId?: string | null;
    membershipCount?: number;
    memberships?: Array<{ condominiumId: string; condominium?: { id: string; nome: string } }>;
  }>;
  tickets: Array<{
    id: string;
    protocol: string;
    title: string;
    status: string;
    priority: string;
    assignedTo: { email: string; nome: string } | null;
  }>;
  documents: Array<{
    id: string;
    originalName: string;
    title?: string;
    kind?: string;
    sizeBytes: number;
    ingestStatus: string;
    storageKey: string;
  }>;
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
  actor: { email: string; nome: string } | null;
  beforeJson: unknown;
  afterJson: unknown;
};

type Me = { user: { role: string } };
type TabId = "contatos" | "chamados" | "documentos" | "comunicacoes";

export default function CondominioFichaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("contatos");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";
  const rule = useQuery({
    queryKey: ["condo-ai-rule", id],
    enabled: admin,
    queryFn: () => api<{ version: number; body: string }>(`/api/condominiums/${id}/ai-rule`),
  });
  const [ruleDraft, setRuleDraft] = useState<string | null>(null);
  const saveRule = useMutation({
    mutationFn: () =>
      api(`/api/condominiums/${id}/ai-rule`, {
        method: "POST",
        body: JSON.stringify({ body: ruleDraft ?? rule.data?.data.body ?? "" }),
      }),
    onSuccess: () => {
      setRuleDraft(null);
      toast("Regra gravada. Ela não autoriza acesso a outro condomínio.");
      void qc.invalidateQueries({ queryKey: ["condo-ai-rule", id] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Não foi possível gravar a regra"),
  });
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
  const [condoIds, setCondoIds] = useState<string[]>([]);
  const [primaryCondoId, setPrimaryCondoId] = useState("");
  const allCondos = useQuery({
    queryKey: ["condominiums", "all-for-contact"],
    enabled: contactOpen,
    queryFn: () => fetchAllCondominiums(api),
  });
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
      const body = {
        nome: cNome,
        phone,
        cargo: cargo || undefined,
        email: email || undefined,
        condominiumId: primaryCondoId || null,
        condominiumIds: condoIds,
      };
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
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  function openNewContact() {
    setEditingContact(null);
    setCNome("");
    setPhone("");
    setCargo("");
    setEmail("");
    setCondoIds([id]);
    setPrimaryCondoId(id);
    setContactOpen(true);
  }

  function openEditContact(ct: Condo["contacts"][number]) {
    setEditingContact(ct);
    setCNome(ct.nome);
    setPhone(e164ToMaskedInput(ct.phoneE164));
    setCargo(ct.cargo || "");
    setEmail(ct.email || "");
    const fromMemberships = (ct.memberships ?? []).map((m) => m.condominiumId);
    const ids = fromMemberships.length
      ? fromMemberships
      : ct.condominiumId
        ? [ct.condominiumId]
        : [id];
    setCondoIds(ids);
    setPrimaryCondoId(ct.condominiumId || ids[0] || id);
    setContactOpen(true);
  }

  const c = q.data?.data;

  if (q.isError) {
    const status = (q.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState />;
    if (status === 404) return <p className="text-[var(--muted)]">Condomínio não encontrado.</p>;
    return <ErrorBanner message="Falha ao carregar ficha." onRetry={() => q.refetch()} />;
  }
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
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)]">
          <ul className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm">
            <li>
              <span className="tabular font-semibold">{c.contacts.length}</span>
              <span className="ml-1 text-muted-foreground">contatos</span>
            </li>
            <li>
              <span className="tabular font-semibold">{c.tickets.length}</span>
              <span className="ml-1 text-muted-foreground">chamados</span>
            </li>
            <li>
              <span className="tabular font-semibold">{c.documents.length}</span>
              <span className="ml-1 text-muted-foreground">documentos</span>
            </li>
            <li>
              <span className="tabular font-semibold">{c.conversations.length}</span>
              <span className="ml-1 text-muted-foreground">comunicações</span>
            </li>
          </ul>
          <section className="border-b border-border p-4">
            <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Cadastro</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
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
              <Button className="mt-3" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
                Salvar cadastro
              </Button>
            ) : null}
            {save.isError ? <p className="mt-2 text-sm text-[var(--danger)]">{(save.error as Error).message}</p> : null}
          </section>
          {admin ? (
            <section className="border-b border-border p-4">
              <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Regra para a IA
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Texto do condomínio. Não substitui a política do sistema e não libera documento de outro condomínio.
              </p>
              <textarea
                className="mt-3 min-h-24 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm"
                value={ruleDraft ?? rule.data?.data.body ?? ""}
                onChange={(e) => setRuleDraft(e.target.value)}
              />
              <Button className="mt-3" type="button" disabled={saveRule.isPending} onClick={() => saveRule.mutate()}>
                Salvar regra
              </Button>
            </section>
          ) : null}
          <SectionTabs
            value={tab}
            onChange={(id) => setTab(id as TabId)}
            tabs={[
              { id: "contatos", label: "Contatos", count: c.contacts.length },
              { id: "chamados", label: "Chamados", count: c.tickets.length },
              { id: "documentos", label: "Documentos", count: c.documents.length },
              { id: "comunicacoes", label: "Comunicações", count: c.conversations.length },
            ]}
          />
          <SectionTabPanel id="contatos" active={tab === "contatos"} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Quem fala por este condomínio.</p>
              {admin ? (
                <Button type="button" variant="secondary" size="sm" onClick={openNewContact}>
                  Adicionar
                </Button>
              ) : null}
            </div>
            {c.contacts.length === 0 ? (
              <EmptyState title="Nenhum contato" hint={admin ? "Adicione o síndico ou o administrador." : undefined} />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {c.contacts.map((ct) => {
                  const extra =
                    (ct.membershipCount ?? ct.memberships?.length ?? 1) > 1
                      ? (ct.membershipCount ?? ct.memberships!.length) - 1
                      : 0;
                  return (
                  <li key={ct.id} className="flex items-start justify-between gap-2 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <PeerAvatar name={ct.nome} avatarUrl={peerAvatarPublicUrl(ct.avatarKey)} className="size-7" />
                      <span className="min-w-0">
                        {ct.nome} · {formatWhatsAppPeer(ct.phoneE164)}
                        {ct.cargo ? ` · ${ct.cargo}` : ""}
                        {extra > 0 ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            + {extra} {extra === 1 ? "condomínio" : "condomínios"}
                          </span>
                        ) : null}
                        {ct.email ? <span className="block text-xs text-muted-foreground">{ct.email}</span> : null}
                      </span>
                    </span>
                    {admin ? (
                      <button type="button" className="text-xs text-primary" onClick={() => openEditContact(ct)}>
                        Editar
                      </button>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            )}
          </SectionTabPanel>
          <SectionTabPanel id="chamados" active={tab === "chamados"} className="p-4">
            {c.tickets.length === 0 ? (
              <EmptyState title="Nenhum chamado visível" />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {c.tickets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link className="text-primary" href={`/chamados/${t.id}`}>
                      #{t.protocol}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <StatusBadge status={t.status} />
                    <span className="text-muted-foreground">{t.assignedTo?.nome || t.assignedTo?.email || "sem responsável"}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionTabPanel>
          <SectionTabPanel id="documentos" active={tab === "documentos"} className="p-4">
            {c.documents.length === 0 ? (
              <EmptyState title="Nenhum arquivo visível" />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {c.documents.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">
                      {d.kind ? (
                        <span className="mr-1 text-xs text-muted-foreground">{documentKindLabel(d.kind)}</span>
                      ) : null}
                      {d.title || d.originalName}
                    </span>
                    <a className="shrink-0 text-primary" href={`/api/files/${d.storageKey}`}>
                      Baixar
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </SectionTabPanel>
          <SectionTabPanel id="comunicacoes" active={tab === "comunicacoes"} className="p-4">
            {c.conversations.length === 0 ? (
              <EmptyState title="Nenhuma conversa visível" />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {c.conversations.map((conv) => (
                  <li key={conv.id} className="py-2">
                    {conv.contact?.nome || "contato"} · {conv.messages[0]?.body || "—"}
                  </li>
                ))}
              </ul>
            )}
          </SectionTabPanel>
          {admin ? (
            <div className="border-t border-border px-4">
              <ExpandableRow title="Histórico" summary="Auditoria cadastral">
                {(audit.data?.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem eventos.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {(audit.data?.data ?? []).map((a) => (
                      <li key={a.id}>
                        {new Date(a.createdAt).toLocaleString("pt-BR")} · {a.actor?.email ?? "Sistema"} · {a.action}
                      </li>
                    ))}
                  </ul>
                )}
              </ExpandableRow>
            </div>
          ) : null}
        </div>
      )}
      <Drawer open={contactOpen} onClose={() => setContactOpen(false)} title={editingContact ? "Editar contato" : "Novo contato"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (condoIds.length > 0 && !primaryCondoId) return;
            saveContact.mutate();
          }}
        >
          <Label htmlFor="cn">Nome</Label>
          <Input id="cn" required value={cNome} onChange={(e) => setCNome(e.target.value)} />
          <PhoneInput id="ph" label="Telefone" required value={phone} onChange={setPhone} />
          <Label htmlFor="cg">Cargo</Label>
          <Input id="cg" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <Label htmlFor="em">E-mail</Label>
          <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <ContactCondominiumPicker
            options={allCondos.data ?? []}
            loading={allCondos.isLoading}
            selectedIds={condoIds}
            primaryId={primaryCondoId}
            onChange={({ selectedIds, primaryId }) => {
              setCondoIds(selectedIds);
              setPrimaryCondoId(primaryId);
            }}
          />
          {saveContact.isError ? <p className="text-sm text-[var(--danger)]">{(saveContact.error as Error).message}</p> : null}
          {editingContact ? <AiContactMemory contactId={editingContact.id} /> : null}
          <Button
            type="submit"
            disabled={saveContact.isPending || (condoIds.length > 0 && !primaryCondoId)}
          >
            Salvar contato
          </Button>
        </form>
      </Drawer>
    </div>
  );
}
