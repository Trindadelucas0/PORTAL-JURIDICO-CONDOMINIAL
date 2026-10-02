"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileText, Image as ImageIcon, Music } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Td, Th } from "@/components/ui/data-table";
import { Toolbar } from "@/components/ui/toolbar";
import {
  DocumentFichaForm,
  type DocumentFichaValues,
  type DocumentTicketOption,
} from "@/components/documentos/document-ficha-form";
import { api } from "@/lib/client/api";
import { documentKindLabel } from "@/lib/documents/kinds";
import { formatBytes, formatWhen, INGEST_STATUS_LABEL } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";

type Doc = {
  id: string;
  kind: string;
  title: string;
  purpose: string;
  notes: string | null;
  originalName: string;
  sizeBytes: number;
  mime: string;
  ingestStatus: string;
  storageKey: string;
  createdAt?: string;
  ticketId?: string | null;
  clientSendable?: boolean;
  ragEnabled?: boolean;
  condominium: { id?: string; nome: string };
};

type Summary = {
  condominiumId: string;
  nome: string;
  count: number;
  sizeBytes: number;
  lastAt: string | null;
};

function DocumentSideFicha({
  doc,
  tickets,
}: {
  doc: Doc;
  tickets: DocumentTicketOption[];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: { role: string } }>("/api/auth/me"),
  });
  const admin = me.data?.data.user.role === "admin";
  const [clientSendable, setClientSendable] = useState(Boolean(doc.clientSendable));
  const [ragEnabled, setRagEnabled] = useState(Boolean(doc.ragEnabled));
  const patchSend = useMutation({
    mutationFn: (next: boolean) =>
      api(`/api/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ clientSendable: next }) }),
    onSuccess: (_res, next) => {
      setClientSendable(next);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => toast((error as Error).message),
  });
  const patchRag = useMutation({
    mutationFn: (next: boolean) =>
      api(`/api/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ ragEnabled: next }) }),
    onSuccess: (_res, next) => {
      setRagEnabled(next);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => toast((error as Error).message),
  });
  const sendDraft = useMutation({
    mutationFn: () => api(`/api/documents/${doc.id}/send-draft`, { method: "POST" }),
    onSuccess: () => toast("Documento enviado no WhatsApp."),
    onError: (error) => toast((error as Error).message),
  });
  const reindex = useMutation({
    mutationFn: () => api(`/api/documents/${doc.id}/reindex`, { method: "POST" }),
    onSuccess: () => {
      toast("Indexação enfileirada");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => toast((error as Error).message),
  });
  const canSend = clientSendable && Boolean(doc.ticketId);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Ficha</p>
        <h2 className="mt-1 text-base font-semibold">{doc.title}</h2>
      </div>
      {doc.mime.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${doc.storageKey}`} alt="" className="max-h-40 w-full rounded-[var(--radius)] bg-muted object-contain" />
      ) : null}
      <dl className="space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Tipo</dt>
          <dd>{documentKindLabel(doc.kind)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Para que serve</dt>
          <dd>{doc.purpose}</dd>
        </div>
        {doc.notes ? (
          <div>
            <dt className="text-xs text-muted-foreground">Observação</dt>
            <dd>{doc.notes}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Condomínio</dt>
          <dd>{doc.condominium.nome}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Arquivo</dt>
          <dd>
            {doc.originalName} · {formatBytes(doc.sizeBytes)}
            {doc.createdAt ? ` · ${formatWhen(doc.createdAt)}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Indexação</dt>
          <dd>{INGEST_STATUS_LABEL[doc.ingestStatus] ?? doc.ingestStatus}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Chamado</dt>
          <dd>{doc.ticketId ? "Vinculado" : "Sem chamado"}</dd>
        </div>
      </dl>
      {!doc.ticketId ? <LinkTicketButton documentId={doc.id} tickets={tickets} /> : null}
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={reindex.isPending || doc.ingestStatus === "pending_index"}
        onClick={() => reindex.mutate()}
      >
        {reindex.isPending ? "Enfileirando…" : "Reindexar"}
      </Button>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={clientSendable}
          disabled={patchSend.isPending}
          onChange={(e) => patchSend.mutate(e.target.checked)}
        />
        <span>Pode enviar ao cliente</span>
      </label>
      {!clientSendable ? (
        <p className="text-xs text-muted-foreground">Marque para permitir envio ao cliente</p>
      ) : null}
      {admin ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={ragEnabled}
            disabled={patchRag.isPending}
            onChange={(e) => patchRag.mutate(e.target.checked)}
          />
          <span>Permitir busca da IA</span>
        </label>
      ) : null}
      <Button
        type="button"
        className="w-full"
        disabled={!canSend || sendDraft.isPending || patchSend.isPending}
        onClick={() => sendDraft.mutate()}
      >
        {sendDraft.isPending ? "Enviando…" : "Enviar no WhatsApp"}
      </Button>
      <a
        className="inline-flex h-9 w-full items-center justify-center rounded-[var(--radius)] bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[var(--brand-soft)]"
        href={`/api/files/${doc.storageKey}`}
      >
        Baixar
      </a>
    </div>
  );
}

function LinkTicketButton({
  documentId,
  tickets,
}: {
  documentId: string;
  tickets: DocumentTicketOption[];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const link = useMutation({
    mutationFn: (id: string) =>
      api(`/api/documents/${documentId}`, { method: "PATCH", body: JSON.stringify({ ticketId: id }) }),
    onSuccess: () => {
      toast("Documento vinculado ao chamado");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => toast((error as Error).message),
  });
  return (
    <>
      <button type="button" className="text-primary" onClick={() => setOpen(true)}>
        Vincular ao chamado
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Vincular ao chamado">
        <div className="space-y-3">
          <label className="block text-sm" htmlFor={`link-ticket-${documentId}`}>
            Chamado (opcional)
          </label>
          <select
            id={`link-ticket-${documentId}`}
            className="w-full rounded-[var(--radius)] border border-border bg-background px-2 py-2 text-sm"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            aria-label="Chamado"
          >
            <option value="">Sem chamado</option>
            {tickets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.protocol} — {t.title}
              </option>
            ))}
          </select>
          {link.isError ? <ErrorBanner message={(link.error as Error).message} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={link.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!ticketId || link.isPending}
              onClick={() => link.mutate(ticketId)}
            >
              {link.isPending ? "Vinculando…" : "Vincular"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function ReindexButton({ documentId, ingestStatus }: { documentId: string; ingestStatus: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const reindex = useMutation({
    mutationFn: () => api(`/api/documents/${documentId}/reindex`, { method: "POST" }),
    onSuccess: () => {
      toast("Indexação enfileirada");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => toast((error as Error).message),
  });
  return (
    <button
      type="button"
      className="text-primary disabled:opacity-50"
      disabled={reindex.isPending || ingestStatus === "pending_index"}
      onClick={() => reindex.mutate()}
    >
      {reindex.isPending ? "Enfileirando…" : "Reindexar"}
    </button>
  );
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("audio/")) return Music;
  return FileText;
}

export default function DocumentosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const condoId = searchParams.get("condominiumId") || "";
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Doc | null>(null);
  const isMobile = useIsMobile();
  const [fichaOpen, setFichaOpen] = useState(false);
  const summary = useQuery({
    queryKey: ["documents-summary"],
    queryFn: () => api<Summary[]>("/api/documents/summary"),
  });
  const docs = useQuery({
    queryKey: ["documents", condoId],
    enabled: Boolean(condoId),
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("condominiumId", condoId);
      p.set("pageSize", "50");
      return api<Doc[]>(`/api/documents?${p.toString()}`);
    },
  });
  const tickets = useQuery({
    queryKey: ["tickets", "documentos", condoId],
    enabled: Boolean(condoId),
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("condominiumId", condoId);
      p.set("pageSize", "50");
      return api<DocumentTicketOption[]>(`/api/tickets?${p.toString()}`);
    },
  });
  const ticketOptions = tickets.data?.data ?? [];

  const upload = useMutation({
    mutationFn: async (values: DocumentFichaValues) => {
      if (!values.file) throw new Error("Arquivo obrigatório");
      if (!condoId) throw new Error("Informe o condomínio");
      const form = new FormData();
      form.append("file", values.file);
      form.append("kind", values.kind);
      form.append("title", values.title);
      form.append("purpose", values.purpose);
      if (values.notes) form.append("notes", values.notes);
      form.append("condominiumId", condoId);
      if (values.ticketId) form.append("ticketId", values.ticketId);
      return api("/api/documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      toast("Documento salvo");
      setFichaOpen(false);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["documents-summary"] });
    },
  });
  const folders = summary.data?.data ?? [];
  const condoQuery = q.trim().toLowerCase();
  const visibleFolders = useMemo(() => {
    if (!condoQuery) return folders;
    return folders.filter((f) => f.nome.toLowerCase().includes(condoQuery));
  }, [folders, condoQuery]);
  const items = useMemo(() => {
    const list = docs.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(s) ||
        d.originalName.toLowerCase().includes(s) ||
        d.purpose.toLowerCase().includes(s) ||
        documentKindLabel(d.kind).toLowerCase().includes(s),
    );
  }, [docs.data, q]);
  const currentCondo = folders.find((f) => f.condominiumId === condoId);
  const truncated = (docs.data?.meta?.total ?? items.length) > items.length;

  function openFolder(id: string) {
    router.replace(`/documentos?condominiumId=${encodeURIComponent(id)}`);
    setQ("");
    setPreview(null);
  }

  function backToGrade() {
    router.replace("/documentos");
    setQ("");
    setPreview(null);
    setFichaOpen(false);
  }

  function openFicha() {
    if (!condoId) return;
    upload.reset();
    setFichaOpen(true);
  }

  if (!condoId) {
    return (
      <div>
        <PageHeader title="Documentos" description={`${folders.length} condomínios`} />
        <Toolbar>
          <Input
            className="max-w-sm"
            placeholder="Buscar condomínio…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar condomínio"
          />
        </Toolbar>
        {summary.isError ? <ErrorBanner message="Falha ao listar condomínios." onRetry={() => summary.refetch()} /> : null}
        {summary.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : folders.length === 0 ? (
          <EmptyState title="Nenhum condomínio" />
        ) : visibleFolders.length === 0 ? (
          <EmptyState title="Nenhum condomínio com esse nome" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFolders.map((f) => (
              <button key={f.condominiumId} type="button" className="text-left" onClick={() => openFolder(f.condominiumId)}>
                <Card>
                  <p className="font-medium">{f.nome}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {f.count} {f.count === 1 ? "documento" : "documentos"}
                  </p>
                  {f.lastAt ? <p className="mt-1 text-xs text-muted-foreground">último {formatWhen(f.lastAt)}</p> : null}
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        back={
          <button type="button" className="text-sm text-[var(--brand)]" onClick={backToGrade}>
            ← Condomínios
          </button>
        }
        title={currentCondo?.nome || "Documentos"}
        description={`${docs.data?.meta?.total ?? items.length} no acervo`}
        action={
          <Button type="button" onClick={openFicha}>
            Novo documento
          </Button>
        }
      />
      <Toolbar>
        <Input
          className="max-w-sm"
          placeholder="Buscar título, finalidade…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar documento"
        />
      </Toolbar>
      {truncated ? (
        <p className="mb-2 text-sm text-muted-foreground" role="status">
          Exibindo {items.length} de {docs.data?.meta?.total} (limite de 50). Refine o filtro para ver os demais.
        </p>
      ) : null}
      {docs.isError ? <ErrorBanner message="Falha ao listar documentos." onRetry={() => docs.refetch()} /> : null}
      {docs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum documento"
          hint={q.trim() ? "Nenhum resultado para essa busca." : "Use Novo documento para cadastrar a ficha e o arquivo."}
          action={q.trim() ? undefined : { label: "Novo documento", onClick: openFicha }}
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)]">
            <ul className="escalonar divide-y divide-border md:hidden">
              {items.map((d, index) => (
                <li key={d.id} className="px-3 py-3 text-sm" style={{ "--stagger-i": index } as React.CSSProperties}>
                  <button type="button" className="w-full text-left" onClick={() => setPreview(d)}>
                    <span className="block font-medium">{d.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{documentKindLabel(d.kind)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {INGEST_STATUS_LABEL[d.ingestStatus] ?? d.ingestStatus}
                    </span>
                  </button>
                  <div className="mt-2 flex gap-3 text-sm">
                    <button type="button" className="text-[var(--brand)]" onClick={() => setPreview(d)}>
                      Ver
                    </button>
                    <a className="text-[var(--brand)]" href={`/api/files/${d.storageKey}`}>
                      Baixar
                    </a>
                    <ReindexButton documentId={d.id} ingestStatus={d.ingestStatus} />
                    {!d.ticketId ? <LinkTicketButton documentId={d.id} tickets={ticketOptions} /> : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <DataTable className="border-t-0">
                <thead>
                  <tr>
                    <Th>Documento</Th>
                    <Th>Tipo</Th>
                    <Th>Indexação</Th>
                    <Th>Finalidade</Th>
                    <Th>Data</Th>
                    <Th>Ações</Th>
                  </tr>
                </thead>
                <tbody className="escalonar">
                  {items.map((d, index) => {
                    const Icon = fileIcon(d.mime);
                    const selected = preview?.id === d.id;
                    return (
                      <tr key={d.id} className={selected ? "bg-[color-mix(in_srgb,var(--brand)_6%,white)]" : undefined} style={{ "--stagger-i": index } as React.CSSProperties}>
                        <Td>
                          <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setPreview(d)}>
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 truncate font-medium">{d.title}</span>
                          </button>
                        </Td>
                        <Td>
                          <span className="inline-flex rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                            {documentKindLabel(d.kind)}
                          </span>
                        </Td>
                        <Td className="text-xs">{INGEST_STATUS_LABEL[d.ingestStatus] ?? d.ingestStatus}</Td>
                        <Td className="max-w-[14rem] truncate">{d.purpose}</Td>
                        <Td className="text-xs text-muted-foreground">{d.createdAt ? formatWhen(d.createdAt) : "—"}</Td>
                        <Td>
                          <div className="flex gap-3 text-xs font-medium">
                            <button type="button" className="text-primary" onClick={() => setPreview(d)}>
                              Ver
                            </button>
                            <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                              Baixar
                            </a>
                            <ReindexButton documentId={d.id} ingestStatus={d.ingestStatus} />
                            {!d.ticketId ? <LinkTicketButton documentId={d.id} tickets={ticketOptions} /> : null}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          </div>
          <aside className="hidden rounded-[var(--radius)] border border-border bg-card p-4 md:block">
            {preview ? (
              <DocumentSideFicha key={preview.id} doc={preview} tickets={ticketOptions} />
            ) : (
              <p className="text-sm text-muted-foreground">Selecione um documento para ver a ficha.</p>
            )}
          </aside>
        </div>
      )}

      <Dialog
        open={fichaOpen}
        onClose={() => {
          setFichaOpen(false);
          upload.reset();
        }}
        title={`Novo documento${currentCondo?.nome ? ` — ${currentCondo.nome}` : ""}`}
      >
        <DocumentFichaForm
          pending={upload.isPending}
          errorMessage={upload.isError ? (upload.error as Error).message : null}
          tickets={ticketOptions}
          onCancel={() => {
            setFichaOpen(false);
            upload.reset();
          }}
          onSubmit={(values) => upload.mutate(values)}
        />
      </Dialog>

      <Drawer open={Boolean(preview) && isMobile} onClose={() => setPreview(null)} title={preview?.title || "Documento"}>
        {preview ? (
          <div className="space-y-4 text-sm">
            {preview.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/files/${preview.storageKey}`}
                alt=""
                className="max-h-64 w-full rounded-[8px] bg-muted object-contain"
              />
            ) : null}
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-muted-foreground">Tipo</dt>
                <dd>{documentKindLabel(preview.kind)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Para que serve</dt>
                <dd>{preview.purpose}</dd>
              </div>
              {preview.notes ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Observação</dt>
                  <dd>{preview.notes}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Condomínio</dt>
                <dd>{preview.condominium.nome}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Arquivo</dt>
                <dd>
                  {preview.originalName} · {formatBytes(preview.sizeBytes)}
                  {preview.createdAt ? ` · ${formatWhen(preview.createdAt)}` : ""}
                </dd>
              </div>
            </dl>
            <a className="text-primary" href={`/api/files/${preview.storageKey}`}>
              Baixar
            </a>
            {!preview.ticketId ? <LinkTicketButton documentId={preview.id} tickets={ticketOptions} /> : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
