"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Condo = { id: string; nome: string; _count?: { contacts: number } };
type Contact = {
  id: string;
  nome: string;
  phoneE164: string;
  cargo: string | null;
  condominium: { nome: string } | null;
};

export default function CondominiosPage() {
  const qc = useQueryClient();
  const condos = useQuery({ queryKey: ["condominiums"], queryFn: () => api<Condo[]>("/api/condominiums") });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: () => api<Contact[]>("/api/contacts") });
  const [nome, setNome] = useState("");
  const [cNome, setCNome] = useState("");
  const [phone, setPhone] = useState("");
  const [condoId, setCondoId] = useState("");
  const createCondo = useMutation({
    mutationFn: () => api("/api/condominiums", { method: "POST", body: JSON.stringify({ nome }) }),
    onSuccess: () => {
      setNome("");
      qc.invalidateQueries({ queryKey: ["condominiums"] });
    },
  });
  const createContact = useMutation({
    mutationFn: () =>
      api("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ nome: cNome, phone, condominiumId: condoId || null }),
      }),
    onSuccess: () => {
      setCNome("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Condomínios e contatos</h1>
      {condos.isError ? <ErrorBanner message="Falha ao carregar condomínios." onRetry={() => condos.refetch()} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-medium">Condomínios</h2>
          {condos.isLoading ? (
            <Skeleton className="mt-3 h-24" />
          ) : (condos.data?.data ?? []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Nenhum condomínio" hint="Cadastre o primeiro para vincular contatos." />
            </div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {(condos.data?.data ?? []).map((c) => (
                <li key={c.id} className="rounded-[12px] bg-[var(--page)] px-3 py-2 text-sm">
                  {c.nome}
                  <span className="ml-2 text-[var(--muted)]">{c._count?.contacts ?? 0} contatos</span>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createCondo.mutate();
            }}
          >
            <Label htmlFor="condo" className="sr-only">
              Nome do condomínio
            </Label>
            <Input id="condo" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Button type="submit" disabled={createCondo.isPending || !nome.trim()}>
              Salvar
            </Button>
          </form>
          {createCondo.isError ? <p className="mt-2 text-sm text-[var(--danger)]">{(createCondo.error as Error).message}</p> : null}
        </Card>
        <Card>
          <h2 className="font-medium">Contatos</h2>
          {contacts.isLoading ? (
            <Skeleton className="mt-3 h-24" />
          ) : (contacts.data?.data ?? []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Nenhum contato" hint="Telefone único em E.164." />
            </div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {(contacts.data?.data ?? []).map((c) => (
                <li key={c.id} className="rounded-[12px] bg-[var(--page)] px-3 py-2 text-sm">
                  {c.nome} · {c.phoneE164}
                  <div className="text-[var(--muted)]">{c.condominium?.nome || "sem condomínio"}</div>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-4 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createContact.mutate();
            }}
          >
            <Input placeholder="Nome" value={cNome} onChange={(e) => setCNome(e.target.value)} aria-label="Nome do contato" />
            <Input placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Telefone" />
            <select
              className="rounded-[12px] border border-[var(--border)] px-3 py-2.5 text-sm"
              value={condoId}
              onChange={(e) => setCondoId(e.target.value)}
              aria-label="Condomínio"
            >
              <option value="">Sem condomínio</option>
              {(condos.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={createContact.isPending || !cNome.trim() || !phone.trim()}>
              Salvar contato
            </Button>
          </form>
          {createContact.isError ? (
            <p className="mt-2 text-sm text-[var(--danger)]">{(createContact.error as Error).message}</p>
          ) : null}
          {createContact.isSuccess ? <p className="mt-2 text-sm text-[var(--ok)]">Contato salvo.</p> : null}
        </Card>
      </div>
    </div>
  );
}
