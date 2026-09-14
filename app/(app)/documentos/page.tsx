"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Doc = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mime: string;
  ingestStatus: string;
  storageKey: string;
  condominium: { nome: string };
  ticket: { protocol: string } | null;
};

type Condo = { id: string; nome: string };
type Ticket = { id: string; protocol: string; title: string };

export default function DocumentosPage() {
  const qc = useQueryClient();
  const [condoId, setCondoId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const condos = useQuery({ queryKey: ["condominiums"], queryFn: () => api<Condo[]>("/api/condominiums") });
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api<Ticket[]>("/api/tickets") });
  const docs = useQuery({
    queryKey: ["documents", condoId, ticketId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (condoId) p.set("condominiumId", condoId);
      if (ticketId) p.set("ticketId", ticketId);
      return api<Doc[]>(`/api/documents?${p.toString()}`);
    },
  });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: { role: string } }>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      if (condoId) form.append("condominiumId", condoId);
      if (ticketId) form.append("ticketId", ticketId);
      return api("/api/documents", { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
  const items = docs.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl">Documentos</h1>
        <p className="text-sm text-[var(--muted)]">
          Arquivos do condomínio/chamado. Índice de IA não está ligado — status permanece stored.
        </p>
      </div>
      <Card className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="condo">Condomínio</Label>
          <select
            id="condo"
            className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2.5 text-sm"
            value={condoId}
            onChange={(e) => setCondoId(e.target.value)}
          >
            <option value="">Todos</option>
            {(condos.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ticket">Chamado (opcional)</Label>
          <select
            id="ticket"
            className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2.5 text-sm"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
          >
            <option value="">—</option>
            {(tickets.data?.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                #{t.protocol} {t.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="file">Upload</Label>
          <input
            id="file"
            type="file"
            className="w-full text-sm"
            accept="image/jpeg,image/png,application/pdf,audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!admin && !ticketId) return;
              upload.mutate(f);
            }}
          />
          {!admin ? <p className="mt-1 text-xs text-[var(--muted)]">Funcionário: escolha um chamado atribuído.</p> : null}
        </div>
      </Card>
      {upload.isError ? <ErrorBanner message={(upload.error as Error).message} /> : null}
      {docs.isError ? <ErrorBanner message="Falha ao listar documentos." onRetry={() => docs.refetch()} /> : null}
      {docs.isLoading ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum documento" hint="PDF, JPEG, PNG ou áudio até 8 MB." />
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{d.originalName}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {d.condominium.nome}
                    {d.ticket ? ` · #${d.ticket.protocol}` : ""} · {Math.round(d.sizeBytes / 1024)} kb
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{d.ingestStatus}</Badge>
                  <a className="text-sm text-[var(--brand)]" href={`/api/files/${d.storageKey}`}>
                    Baixar
                  </a>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
