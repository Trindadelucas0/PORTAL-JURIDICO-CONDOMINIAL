"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/client/api";
import { formatWhatsAppPeer } from "@/lib/phone/display";
import { PhoneInput } from "@/components/ui/phone-input";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { peerAvatarPublicUrl } from "@/lib/phone/avatar-url";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type Condo = {
  id: string;
  nome: string;
  cidadeUf?: string | null;
  cnpj?: string | null;
  _count?: { contacts: number; documents: number };
};
type Detail = {
  id: string;
  nome: string;
  cidadeUf: string | null;
  cnpj?: string | null;
  tickets?: Array<{ id: string; protocol: string; title: string; status: string }>;
  contacts: Array<{
    id: string;
    nome: string;
    phoneE164: string;
    cargo: string | null;
    email?: string | null;
    avatarKey?: string | null;
    membershipCount?: number;
  }>;
};

export default function CondominiosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [cNome, setCNome] = useState("");
  const [phone, setPhone] = useState("");
  const [cargo, setCargo] = useState("");
  const [email, setEmail] = useState("");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: { role: string } }>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";
  const condos = useQuery({ queryKey: ["condominiums"], queryFn: () => api<Condo[]>("/api/condominiums") });
  const detail = useQuery({
    queryKey: ["condominium", selected],
    enabled: Boolean(selected),
    queryFn: () => api<Detail>(`/api/condominiums/${selected}`),
  });
  const createCondo = useMutation({
    mutationFn: () => api<Condo>("/api/condominiums", { method: "POST", body: JSON.stringify({ nome }) }),
    onSuccess: (res) => {
      setNome("");
      setCreateOpen(false);
      toast("Condomínio salvo");
      qc.invalidateQueries({ queryKey: ["condominiums"] });
      setSelected(res.data.id);
    },
  });
  const createContact = useMutation({
    mutationFn: () =>
      api("/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          nome: cNome,
          phone,
          cargo: cargo || undefined,
          email: email || undefined,
          condominiumId: selected,
        }),
      }),
    onSuccess: () => {
      setCNome("");
      setPhone("");
      setCargo("");
      setEmail("");
      setContactOpen(false);
      toast("Contato salvo");
      qc.invalidateQueries({ queryKey: ["condominium", selected] });
      qc.invalidateQueries({ queryKey: ["condominiums"] });
    },
  });
  const items = useMemo(() => {
    const list = condos.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => c.nome.toLowerCase().includes(s));
  }, [condos.data, q]);
  const current = detail.data?.data;
  const listItem = useMemo(
    () => (condos.data?.data ?? []).find((c) => c.id === selected) ?? null,
    [condos.data, selected],
  );

  return (
    <div>
      <PageHeader
        title="Condomínios"
        action={
          admin ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Novo condomínio
            </Button>
          ) : undefined
        }
      />
      {condos.isError ? <ErrorBanner message="Falha ao carregar condomínios." onRetry={() => condos.refetch()} /> : null}
      <div className="grid min-h-[60vh] overflow-hidden rounded-[var(--radius)] border border-border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
            <aside className="border-b border-border bg-background p-3 lg:border-r lg:border-b-0">
              <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar condomínio" className="h-8" />
              {condos.isLoading ? (
                <Skeleton className="mt-3 h-24" />
              ) : items.length === 0 ? (
                <EmptyState title="Tudo limpo" />
              ) : (
                <ul className="mt-2">
                  {items.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={cn(
                          "mb-2 w-full rounded-[var(--radius)] border border-l-4 px-3 py-3 text-left text-sm transition-colors duration-[var(--motion-fast)]",
                          selected === c.id
                            ? "border-border border-l-primary bg-card"
                            : "border-border border-l-transparent bg-card hover:border-[var(--border-strong)]",
                        )}
                        onClick={() => setSelected(c.id)}
                      >
                        <span className="block font-semibold text-foreground">{c.nome}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{c.cidadeUf || "Cidade não informada"}</span>
                        {c.cnpj ? <span className="mt-1 block font-mono text-[11px] text-foreground">CNPJ {c.cnpj}</span> : null}
                        <span className="mt-2 block text-[11px] text-muted-foreground">
                          {c._count?.contacts ?? 0} contatos · {c._count?.documents ?? 0} documentos
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
            <section className="bg-background p-4">
              {!selected ? (
                <p className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
                  Selecione um condomínio
                </p>
              ) : detail.isLoading || !current ? (
                <Skeleton className="h-32" />
              ) : (
                <div className="space-y-4">
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">{current.nome}</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {current.cidadeUf || "Cidade não informada"}
                        </p>
                        {current.cnpj ? (
                          <p className="mt-1 font-mono text-xs text-foreground">CNPJ {current.cnpj}</p>
                        ) : null}
                      </div>
                      <Link
                        href={`/condominios/${current.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        Editar cadastro
                      </Link>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3">
                      <div className="min-w-[5.5rem]">
                        <p className="text-lg font-semibold tabular-nums text-foreground">{current.contacts.length}</p>
                        <p className="text-[11px] text-muted-foreground">Contatos</p>
                      </div>
                      <div className="min-w-[5.5rem]">
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                          {listItem?._count?.documents ?? 0}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Documentos</p>
                      </div>
                      <div className="min-w-[5.5rem]">
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                          {current.tickets?.length ?? 0}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Chamados</p>
                      </div>
                    </div>
                  </Card>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        Contatos
                      </h3>
                      {admin ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => setContactOpen(true)}>
                          Adicionar contato
                        </Button>
                      ) : null}
                    </div>
                    {current.contacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum contato.</p>
                    ) : (
                      <ul className="space-y-2">
                        {current.contacts.map((ct) => {
                          const extra = (ct.membershipCount ?? 1) > 1 ? (ct.membershipCount ?? 1) - 1 : 0;
                          return (
                          <li key={ct.id}>
                            <Card className="flex items-start gap-3 p-3">
                              <PeerAvatar
                                name={ct.nome}
                                avatarUrl={peerAvatarPublicUrl(ct.avatarKey)}
                                className="size-8 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">{ct.nome}</p>
                                {ct.cargo ? (
                                  <p className="text-xs text-muted-foreground">{ct.cargo}</p>
                                ) : null}
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatWhatsAppPeer(ct.phoneE164)}
                                  {ct.email ? ` · ${ct.email}` : null}
                                  {extra > 0 ? ` · + ${extra} ${extra === 1 ? "condomínio" : "condomínios"}` : null}
                                </p>
                              </div>
                            </Card>
                          </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {current.tickets && current.tickets.length > 0 ? (
                    <div>
                      <h3 className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        Chamados
                      </h3>
                      <ul className="space-y-2">
                        {current.tickets.slice(0, 8).map((t) => (
                          <li key={t.id}>
                            <Link
                              href={`/chamados/${t.id}`}
                              className="flex items-start justify-between gap-3 rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--shadow-sm)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)]"
                            >
                              <span className="min-w-0">
                                <span className="block font-mono text-[11px] font-semibold text-foreground">
                                  #{t.protocol}
                                </span>
                                <span className="mt-0.5 block truncate text-sm text-muted-foreground">{t.title}</span>
                              </span>
                              <StatusBadge status={t.status} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </div>
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo condomínio"
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createCondo.isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="condo-create-form" loading={createCondo.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        <form
          id="condo-create-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createCondo.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          {createCondo.isError ? <p className="text-sm text-[var(--danger)]">{(createCondo.error as Error).message}</p> : null}
        </form>
      </Drawer>
      <Drawer
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Novo contato"
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setContactOpen(false)} disabled={createContact.isPending}>
              Cancelar
            </Button>
            <Button type="submit" form="contact-create-form" loading={createContact.isPending} disabled={!selected}>
              Salvar contato
            </Button>
          </>
        }
      >
        <form
          id="contact-create-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createContact.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cn">Nome</Label>
            <Input id="cn" required value={cNome} onChange={(e) => setCNome(e.target.value)} />
          </div>
          <PhoneInput id="ph" label="Telefone" required value={phone} onChange={setPhone} />
          <div className="space-y-1.5">
            <Label htmlFor="cg">Cargo</Label>
            <Input id="cg" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em">E-mail</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Este número entra no fluxo do condomínio na próxima mensagem.</p>
          {createContact.isError ? <p className="text-sm text-[var(--danger)]">{(createContact.error as Error).message}</p> : null}
        </form>
      </Drawer>
    </div>
  );
}
