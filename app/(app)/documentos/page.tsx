"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, FolderOpen, Image as ImageIcon, Music } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/client/api";
import { formatBytes, formatWhen } from "@/lib/ui-labels";
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
type Summary = {
  condominiumId: string;
  nome: string;
  count: number;
  sizeBytes: number;
  lastAt: string | null;
};

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("audio/")) return Music;
  return FileText;
}

export default function DocumentosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [condoId, setCondoId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Doc | null>(null);
  const condos = useQuery({ queryKey: ["condominiums"], queryFn: () => api<Condo[]>("/api/condominiums") });
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api<Ticket[]>("/api/tickets") });
  const summary = useQuery({
    queryKey: ["documents-summary"],
    queryFn: () => api<Summary[]>("/api/documents/summary"),
  });
  const docs = useQuery({
    queryKey: ["documents", condoId, ticketId],
    enabled: Boolean(condoId),
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("condominiumId", condoId);
      if (ticketId) p.set("ticketId", ticketId);
      p.set("pageSize", "50");
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
      qc.invalidateQueries({ queryKey: ["documents-summary"] });
    },
  });
  const sendDraft = useMutation({
    mutationFn: (id: string) => api(`/api/documents/${id}/send-draft`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => toast("Documento enviado no WhatsApp"),
  });
  const folders = useMemo(() => {
    const list = summary.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s || condoId) return list;
    return list.filter((d) => d.nome.toLowerCase().includes(s));
  }, [summary.data, q, condoId]);
  const items = useMemo(() => {
    const list = docs.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((d) => d.originalName.toLowerCase().includes(s));
  }, [docs.data, q]);
  const currentCondo = folders.find((f) => f.condominiumId === condoId) ?? (condos.data?.data ?? []).find((c) => c.id === condoId);
  const totalFiles = folders.reduce((n, f) => n + f.count, 0);

  function triggerUpload() {
    if (!admin && !ticketId) return;
    const input = document.getElementById("doc-upload") as HTMLInputElement | null;
    input?.click();
  }

  return (
    <div>
      <PageHeader
        back={
          condoId ? (
            <button
              type="button"
              className="text-sm text-primary"
              onClick={() => {
                setCondoId("");
                setTicketId("");
                setQ("");
                setPreview(null);
              }}
            >
              ← Documentos
            </button>
          ) : undefined
        }
        title={condoId ? currentCondo?.nome || "Condomínio" : "Documentos"}
        description={
          condoId
            ? `${docs.data?.meta?.total ?? items.length} arquivo(s)`
            : `${totalFiles} arquivos em ${folders.length} condomínios`
        }
        action={
          condoId ? (
            <label className="inline-flex">
              <span className="sr-only">Enviar arquivo</span>
              <input
                id="doc-upload"
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,application/pdf,audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!admin && !ticketId) return;
                  upload.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button type="button" onClick={triggerUpload}>
                Enviar arquivo
              </Button>
            </label>
          ) : null
        }
      />
      {!condoId ? (
        <>
          <Toolbar>
            <Input className="max-w-sm" placeholder="Buscar condomínio…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar condomínio" />
          </Toolbar>
          {summary.isError ? <ErrorBanner message="Falha ao listar pastas." onRetry={() => summary.refetch()} /> : null}
          {summary.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : folders.length === 0 ? (
            <EmptyState title="Nenhum condomínio com arquivo" hint="Envie um PDF, JPEG, PNG ou áudio a partir de um chamado ou da pasta do condomínio." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {folders.map((folder) => (
                <button key={folder.condominiumId} type="button" className="text-left" onClick={() => { setCondoId(folder.condominiumId); setQ(""); }}>
                  <Card className="h-full transition-shadow hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FolderOpen className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{folder.nome}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {folder.count} arquivo{folder.count === 1 ? "" : "s"} · {formatBytes(folder.sizeBytes)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {folder.lastAt ? `último: ${formatWhen(folder.lastAt)}` : "sem data"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-primary">Abrir →</p>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Toolbar>
            <Input className="max-w-sm" placeholder="Buscar arquivo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar documento" />
            <Select className="max-w-[14rem]" value={ticketId} onChange={(e) => setTicketId(e.target.value)} aria-label="Chamado">
              <option value="">Chamado</option>
              {(tickets.data?.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.protocol}
                </option>
              ))}
            </Select>
          </Toolbar>
          {!admin ? <p className="mb-3 text-xs text-muted-foreground">Funcionário: escolha um chamado atribuído para enviar arquivo.</p> : null}
          {upload.isError ? <ErrorBanner message={(upload.error as Error).message} /> : null}
          {docs.isError ? <ErrorBanner message="Falha ao listar documentos." onRetry={() => docs.refetch()} /> : null}
          {docs.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Nenhum documento" hint="PDF, JPEG, PNG ou áudio até 8 MB." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((d) => {
                const Icon = fileIcon(d.mime);
                return (
                  <Card key={d.id} className="flex flex-col">
                    <button type="button" className="flex min-w-0 items-start gap-3 text-left" onClick={() => setPreview(d)}>
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{d.originalName}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {formatBytes(d.sizeBytes)}
                          {d.createdAt ? ` · ${formatWhen(d.createdAt)}` : ""}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {d.ticket ? `#${d.ticket.protocol}` : "sem chamado"}
                        </span>
                      </span>
                    </button>
                    <div className="mt-4 flex flex-wrap gap-3 text-sm">
                      <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                        Baixar
                      </a>
                      <button type="button" className="text-primary" disabled={sendDraft.isPending} onClick={() => sendDraft.mutate(d.id)}>
                        WhatsApp
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      <Drawer open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.originalName || "Documento"}>
        {preview ? (
          <div className="space-y-4 text-sm">
            {preview.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${preview.storageKey}`} alt="" className="max-h-64 w-full rounded-[10px] object-contain bg-muted" />
            ) : null}
            <p>
              {preview.condominium.nome}
              {preview.ticket ? ` · #${preview.ticket.protocol}` : ""}
            </p>
            <p className="text-muted-foreground">{formatBytes(preview.sizeBytes)}</p>
            <div className="flex flex-wrap gap-2">
              <a className="text-primary" href={`/api/files/${preview.storageKey}`}>
                Baixar
              </a>
              <button type="button" className="text-primary" disabled={sendDraft.isPending} onClick={() => sendDraft.mutate(preview.id)}>
                Enviar WhatsApp
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
