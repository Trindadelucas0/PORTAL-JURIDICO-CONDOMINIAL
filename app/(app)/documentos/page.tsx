"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { FileItem } from "@/components/ui/file-item";
import { api } from "@/lib/client/api";
import { formatBytes } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";

type Doc = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mime: string;
  ingestStatus: string;
  storageKey: string;
  createdAt?: string;
  condominium: { nome: string };
  ticket: { protocol: string } | null;
};

type Condo = { id: string; nome: string };
type Ticket = { id: string; protocol: string; title: string };

export default function DocumentosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [condoId, setCondoId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Doc | null>(null);
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
    onSuccess: () => {
      toast("Arquivo enviado");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
  const sendDraft = useMutation({
    mutationFn: (id: string) => api(`/api/documents/${id}/send-draft`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => toast("Documento enviado no WhatsApp"),
  });
  const items = useMemo(() => {
    const list = docs.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((d) => d.originalName.toLowerCase().includes(s));
  }, [docs.data, q]);

  return (
    <div>
      <PageHeader
        title="Documentos"
        action={
          <label className="inline-flex">
            <span className="sr-only">Enviar arquivo</span>
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,application/pdf,audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!admin && !ticketId) return;
                upload.mutate(f);
              }}
            />
            <Button type="button" onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.click()}>
              Enviar arquivo
            </Button>
          </label>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-sm" placeholder="Buscar documento…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar documento" />
        <Select className="max-w-[12rem]" value={condoId} onChange={(e) => setCondoId(e.target.value)} aria-label="Condomínio">
          <option value="">Condomínio</option>
          {(condos.data?.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
        <Select className="max-w-[14rem]" value={ticketId} onChange={(e) => setTicketId(e.target.value)} aria-label="Chamado">
          <option value="">Chamado</option>
          {(tickets.data?.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              #{t.protocol}
            </option>
          ))}
        </Select>
      </div>
      {!admin ? <p className="mt-2 text-xs text-[var(--muted)]">Funcionário: escolha um chamado atribuído para enviar arquivo.</p> : null}
      {upload.isError ? <ErrorBanner message={(upload.error as Error).message} /> : null}
      {docs.isError ? <ErrorBanner message="Falha ao listar documentos." onRetry={() => docs.refetch()} /> : null}
      {docs.isLoading ? (
        <Skeleton className="mt-4 h-32" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum documento" hint="PDF, JPEG, PNG ou áudio até 8 MB." />
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)]">
          {items.map((d) => (
            <li key={d.id}>
              <button type="button" className="w-full text-left" onClick={() => setPreview(d)}>
                <FileItem
                  name={d.originalName}
                  sizeBytes={d.sizeBytes}
                  meta={`${d.condominium.nome}${d.ticket ? ` · #${d.ticket.protocol}` : ""}`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Drawer open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.originalName || "Documento"}>
        {preview ? (
          <div className="space-y-4 text-sm">
            {preview.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${preview.storageKey}`} alt="" className="max-h-64 w-full rounded-[10px] object-contain bg-[var(--page)]" />
            ) : null}
            <p>
              {preview.condominium.nome}
              {preview.ticket ? ` · #${preview.ticket.protocol}` : ""}
            </p>
            <p className="text-[var(--muted)]">{formatBytes(preview.sizeBytes)}</p>
            <div className="flex flex-wrap gap-2">
              <a className="text-[var(--brand)]" href={`/api/files/${preview.storageKey}`}>
                Baixar
              </a>
              <button type="button" className="text-[var(--brand)]" disabled={sendDraft.isPending} onClick={() => sendDraft.mutate(preview.id)}>
                Enviar WhatsApp
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
