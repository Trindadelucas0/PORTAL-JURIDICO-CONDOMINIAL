"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Music } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { DocumentFichaForm, type DocumentFichaValues } from "@/components/documentos/document-ficha-form";
import { api } from "@/lib/client/api";
import { documentKindLabel } from "@/lib/documents/kinds";
import { formatBytes, formatWhen } from "@/lib/ui-labels";
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
  condominium: { id?: string; nome: string };
  ticket: { id?: string; protocol: string } | null;
};

type Ticket = { id: string; protocol: string; title: string; condominium?: { id: string }; condominiumId?: string };
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
  const [fichaOpen, setFichaOpen] = useState(false);
  const tickets = useQuery({
    queryKey: ["tickets", "docs"],
    queryFn: () => api<Ticket[]>("/api/tickets?pageSize=50"),
  });
  const summary = useQuery({
    queryKey: ["documents-summary"],
    queryFn: () => api<Summary[]>("/api/documents/summary"),
  });
  const docs = useQuery({
    queryKey: ["documents", condoId, ticketId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (condoId) p.set("condominiumId", condoId);
      if (ticketId) p.set("ticketId", ticketId);
      p.set("pageSize", "50");
      return api<Doc[]>(`/api/documents?${p.toString()}`);
    },
  });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: { role: string } }>("/api/auth/me") });
  const admin = me.data?.data.user.role === "admin";

  const condoTickets = useMemo(() => {
    const list = tickets.data?.data ?? [];
    if (!condoId) return list;
    return list.filter((t) => {
      const cid = t.condominiumId || t.condominium?.id;
      return cid === condoId;
    });
  }, [tickets.data, condoId]);

  const upload = useMutation({
    mutationFn: async (values: DocumentFichaValues) => {
      if (!values.file) throw new Error("Arquivo obrigatório");
      const form = new FormData();
      form.append("file", values.file);
      form.append("kind", values.kind);
      form.append("title", values.title);
      form.append("purpose", values.purpose);
      if (values.notes) form.append("notes", values.notes);
      if (condoId) form.append("condominiumId", condoId);
      const linkedTicket = values.ticketId || ticketId;
      if (linkedTicket) form.append("ticketId", linkedTicket);
      return api("/api/documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      toast("Documento salvo");
      setFichaOpen(false);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["documents-summary"] });
    },
  });
  const sendDraft = useMutation({
    mutationFn: (id: string) => api(`/api/documents/${id}/send-draft`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => toast("Documento enviado no WhatsApp"),
  });
  const folders = summary.data?.data ?? [];
  const items = useMemo(() => {
    const list = docs.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(s) ||
        d.originalName.toLowerCase().includes(s) ||
        d.purpose.toLowerCase().includes(s) ||
        d.condominium.nome.toLowerCase().includes(s) ||
        documentKindLabel(d.kind).toLowerCase().includes(s),
    );
  }, [docs.data, q]);
  const currentCondo = folders.find((f) => f.condominiumId === condoId);
  const truncated = (docs.data?.meta?.total ?? items.length) > items.length;

  function openFicha() {
    if (!admin && condoTickets.length === 0) return;
    upload.reset();
    setFichaOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Documentos"
        description={`${docs.data?.meta?.total ?? items.length} no acervo`}
        action={
          <Button type="button" onClick={openFicha} disabled={!admin && condoTickets.length === 0}>
            Novo documento
          </Button>
        }
      />
      <Toolbar>
        <Input
          className="max-w-sm"
          placeholder="Buscar título, finalidade, condomínio…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar documento"
        />
        <Select className="max-w-[14rem]" value={condoId} onChange={(e) => { setCondoId(e.target.value); setTicketId(""); }} aria-label="Condomínio">
          <option value="">Todos os condomínios</option>
          {folders.map((f) => (
            <option key={f.condominiumId} value={f.condominiumId}>
              {f.nome} ({f.count})
            </option>
          ))}
        </Select>
        <Select className="max-w-[14rem]" value={ticketId} onChange={(e) => setTicketId(e.target.value)} aria-label="Chamado">
          <option value="">Chamado</option>
          {condoTickets.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.protocol}
            </option>
          ))}
        </Select>
      </Toolbar>
      {!admin ? (
        <p className="mb-3 text-xs text-muted-foreground">Funcionário: escolha um chamado atribuído para cadastrar documento.</p>
      ) : null}
      {truncated ? (
        <p className="mb-2 text-sm text-muted-foreground" role="status">
          Exibindo {items.length} de {docs.data?.meta?.total} (limite de 50). Refine o filtro para ver os demais.
        </p>
      ) : null}
      {summary.isError ? <ErrorBanner message="Falha ao listar condomínios." onRetry={() => summary.refetch()} /> : null}
      {docs.isError ? <ErrorBanner message="Falha ao listar documentos." onRetry={() => docs.refetch()} /> : null}
      {docs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum documento" hint="Use Novo documento para cadastrar a ficha e o arquivo." />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((d) => {
            const Icon = fileIcon(d.mime);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                  onClick={() => setPreview(d)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-xs text-muted-foreground">{documentKindLabel(d.kind)}</span>
                    <span className="min-w-0 truncate font-medium">{d.title}</span>
                  </span>
                  <span className="line-clamp-1 pl-6 text-xs text-muted-foreground">
                    {d.condominium.nome}
                    {d.ticket ? ` · #${d.ticket.protocol}` : ""}
                    {d.createdAt ? ` · ${formatWhen(d.createdAt)}` : ""}
                    {` · ${d.purpose}`}
                  </span>
                </button>
                <div className="flex gap-3 text-sm">
                  <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                    Baixar
                  </a>
                  <button type="button" className="text-primary" disabled={sendDraft.isPending} onClick={() => sendDraft.mutate(d.id)}>
                    WhatsApp
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={fichaOpen}
        onClose={() => {
          setFichaOpen(false);
          upload.reset();
        }}
        title={`Novo documento${currentCondo?.nome ? ` — ${currentCondo.nome}` : ""}`}
      >
        {!condoId && admin ? (
          <p className="mb-3 text-sm text-muted-foreground">Selecione o condomínio na barra de filtros antes de gravar, ou vincule a um chamado.</p>
        ) : null}
        <DocumentFichaForm
          tickets={condoTickets}
          showTicketSelect
          requireTicket={!admin}
          pending={upload.isPending}
          errorMessage={upload.isError ? (upload.error as Error).message : null}
          onCancel={() => {
            setFichaOpen(false);
            upload.reset();
          }}
          onSubmit={(values) => upload.mutate(values)}
        />
      </Dialog>

      <Drawer open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.title || "Documento"}>
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
                <dd>
                  {preview.condominium.nome}
                  {preview.ticket ? ` · #${preview.ticket.protocol}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Arquivo</dt>
                <dd>
                  {preview.originalName} · {formatBytes(preview.sizeBytes)}
                  {preview.createdAt ? ` · ${formatWhen(preview.createdAt)}` : ""}
                </dd>
              </div>
            </dl>
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
