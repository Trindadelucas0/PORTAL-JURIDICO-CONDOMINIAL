"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { Frame, FramePanel } from "@/components/reui/frame";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type Condo = { id: string; nome: string; cidadeUf?: string | null; _count?: { contacts: number; documents: number } };
type Detail = {
  id: string;
  nome: string;
  cidadeUf: string | null;
  contacts: Array<{ id: string; nome: string; phoneE164: string; cargo: string | null; email?: string | null }>;
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

  return (
    <div>
      <PageHeader
        title="Condomínios"
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Novo condomínio
          </Button>
        }
      />
      {condos.isError ? <ErrorBanner message="Falha ao carregar condomínios." onRetry={() => condos.refetch()} /> : null}
      <Frame>
        <FramePanel>
          <div className="grid min-h-[60vh] overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="border-b border-border bg-[var(--surface-2)] p-4 lg:border-b-0 lg:border-r">
              <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar condomínio" />
              {condos.isLoading ? (
                <Skeleton className="mt-3 h-24" />
              ) : items.length === 0 ? (
                <EmptyState title="Nenhum condomínio" />
              ) : (
                <ul className="mt-3 space-y-1">
                  {items.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded-[10px] px-3 py-2.5 text-left text-sm",
                          selected === c.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-card/80",
                        )}
                        onClick={() => setSelected(c.id)}
                      >
                        <span className="font-medium">{c.nome}</span>
                        <span className={cn("mt-0.5 block text-xs", selected === c.id ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          {c._count?.contacts ?? 0} contatos · {c._count?.documents ?? 0} docs
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
            <section className="p-6">
              {!selected ? (
                <p className="text-sm text-muted-foreground">Selecione um condomínio</p>
              ) : detail.isLoading || !current ? (
                <Skeleton className="h-32" />
              ) : (
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{current.nome}</h2>
                      <p className="text-sm text-muted-foreground">{current.cidadeUf || "—"}</p>
                    </div>
                    <Link href={`/condominios/${current.id}`} className="text-sm text-primary">
                      Editar cadastro
                    </Link>
                  </div>
                  <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Contatos</h3>
                  {current.contacts.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Nenhum contato.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {current.contacts.map((ct) => (
                        <li key={ct.id} className="flex justify-between gap-2 rounded-[10px] border border-border bg-[var(--surface-2)] px-3 py-2 text-sm">
                          <span>
                            {ct.nome}
                            {ct.cargo ? <span className="text-muted-foreground"> · {ct.cargo}</span> : null}
                            {ct.email ? <span className="block text-xs text-muted-foreground">{ct.email}</span> : null}
                          </span>
                          <span className="text-muted-foreground">{ct.phoneE164}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button className="mt-4" type="button" variant="secondary" onClick={() => setContactOpen(true)}>
                    Adicionar contato
                  </Button>
                </div>
              )}
            </section>
          </div>
        </FramePanel>
      </Frame>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Novo condomínio">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createCondo.mutate();
          }}
        >
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          {createCondo.isError ? <p className="text-sm text-[var(--danger)]">{(createCondo.error as Error).message}</p> : null}
          <Button type="submit" disabled={createCondo.isPending}>
            Salvar
          </Button>
        </form>
      </Drawer>
      <Drawer open={contactOpen} onClose={() => setContactOpen(false)} title="Novo contato">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createContact.mutate();
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
          <p className="text-xs text-[var(--muted)]">Este número entra no fluxo do condomínio na próxima mensagem.</p>
          {createContact.isError ? <p className="text-sm text-[var(--danger)]">{(createContact.error as Error).message}</p> : null}
          <Button type="submit" disabled={createContact.isPending || !selected}>
            Salvar contato
          </Button>
        </form>
      </Drawer>
    </div>
  );
}
