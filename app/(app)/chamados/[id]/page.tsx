"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Timeline } from "@/components/ui/timeline";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import { FileItem } from "@/components/ui/file-item";
import { api } from "@/lib/client/api";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL, TICKET_STATUSES, STATUS_LABEL, formatBytes, formatWhen } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";

type Ticket = {
  id: string;
  protocol: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  createdAt?: string;
  conversationId: string | null;
  assignedTo: { id: string; email: string; nome?: string } | null;
  condominium: { id: string; nome: string };
  contact: { nome: string; phoneE164: string };
  conversation: { connection: { status: string; label: string; type: string } } | null;
  documents: Array<{ id: string; originalName: string; sizeBytes: number; ingestStatus: string; storageKey: string }>;
  messages: Array<{ id: string; body: string; sendStatus: string }>;
};

type Msg = {
  id: string;
  body: string;
  direction: string;
  visibility: string;
  sendStatus: string;
  createdAt: string;
};

export default function ChamadoFichaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const toast = useToast();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ user: { role: string; apenasRascunho: boolean; podeResponderCliente: boolean } }>("/api/auth/me"),
  });
  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api<Ticket>(`/api/tickets/${id}`),
  });
  const messages = useQuery({
    queryKey: ["ticket-messages", id, ticket.data?.data.conversationId],
    enabled: Boolean(ticket.data?.data.conversationId),
    queryFn: () => api<Msg[]>(`/api/conversations/${ticket.data!.data.conversationId}/messages?pageSize=50`),
  });

  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"publica" | "interna">("publica");
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [openDocModal, setOpenDocModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => api<Array<{ id: string; email: string; nome?: string; ativo: boolean }>>("/api/team"),
    enabled: Boolean(me.data?.data.user.role === "admin"),
  });
  const audit = useQuery({
    queryKey: ["audit", "ticket", id],
    enabled: Boolean(me.data?.data.user.role === "admin"),
    queryFn: () =>
      api<Array<{ id: string; action: string; createdAt: string; actor: { email: string } }>>(
        `/api/audit?entityType=ticket&entityId=${id}`,
      ),
  });

  const send = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("body", body);
      form.append("visibility", mode);
      if (file) form.append("file", file);
      return api(`/api/tickets/${id}/messages`, { method: "POST", body: form });
    },
    onSuccess: () => {
      setBody("");
      setFile(null);
      toast(mode === "interna" ? "Nota salva" : "Mensagem enviada");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
    },
  });
  const patch = useMutation({
    mutationFn: () => {
      const current = ticket.data?.data;
      return api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: status || current?.status,
          title: title || current?.title,
          priority: priority || current?.priority,
          category: category || current?.category,
          assignedToId: assignedToId || current?.assignedTo?.id || null,
        }),
      });
    },
    onSuccess: () => {
      toast("Chamado atualizado");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });
  const upload = useMutation({
    mutationFn: async (docFile: File) => {
      const form = new FormData();
      form.append("file", docFile);
      form.append("ticketId", id);
      return api("/api/documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      toast("Arquivo enviado");
      setPendingFile(null);
      setOpenDocModal(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });

  const closeDocModal = () => {
    setOpenDocModal(false);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    upload.reset();
  };

  const sendDoc = useMutation({
    mutationFn: (docId: string) => api(`/api/documents/${docId}/send-draft`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast("Documento enviado no WhatsApp");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
    },
  });

  const timeline = useMemo(() => {
    const msgs = (messages.data?.data ?? []).map((m) => {
      const interna = m.visibility === "interna";
      const incoming = m.direction === "in";
      return {
        id: m.id,
        kind: "message" as const,
        body: m.body,
        at: m.createdAt,
        label: interna ? "Nota interna" : incoming ? "WhatsApp · cliente" : "WhatsApp · saída",
        tone: (interna ? "interna" : incoming ? "in" : "out") as "interna" | "in" | "out",
      };
    });
    const audits = (audit.data?.data ?? []).map((a) => ({
      id: a.id,
      kind: "system" as const,
      body: `${a.actor.email} · ${a.action}`,
      at: a.createdAt,
    }));
    return [...msgs, ...audits].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);
  }, [messages.data, audit.data]);

  if (ticket.isError) {
    const statusCode = (ticket.error as Error & { status?: number }).status;
    if (statusCode === 403) return <ForbiddenState message="Sem permissão para este chamado." />;
    if (statusCode === 404) return <p className="text-[var(--muted)]">Chamado não encontrado.</p>;
    return <ErrorBanner message="Falha ao carregar chamado." onRetry={() => ticket.refetch()} />;
  }

  const t = ticket.data?.data;
  const admin = me.data?.data.user.role === "admin";
  const steps = ["aberto", "em_andamento", "aguardando", "resolvido"];

  return (
    <div>
      <PageHeader
        back={
          <Link href="/chamados" className="text-sm text-[var(--brand)]">
            ← Chamados
          </Link>
        }
        title={t ? `#${t.protocol}` : "Chamado"}
        description={t ? `${t.title} · ${t.condominium.nome}` : undefined}
      />
      {ticket.isLoading || !t ? (
        <Skeleton className="h-48" />
      ) : (
        <>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-8">
            <Stepper value={Math.max(1, steps.indexOf(t.status) + 1)} className="w-full">
              <StepperNav>
                {steps.map((s, i) => (
                  <StepperItem key={s} step={i + 1} className="flex-1">
                    <StepperTrigger>
                      <StepperIndicator />
                      <StepperTitle>{STATUS_LABEL[s]}</StepperTitle>
                    </StepperTrigger>
                    {i < steps.length - 1 ? <StepperSeparator /> : null}
                  </StepperItem>
                ))}
              </StepperNav>
            </Stepper>
            <section>
              <Frame>
                <FramePanel>
                  <FrameHeader>
                    <FrameTitle>Atividade</FrameTitle>
                  </FrameHeader>
                  <div className="px-4 pb-4">
                    {messages.isLoading ? <Skeleton className="h-24" /> : <Timeline items={timeline} />}
                  </div>
                </FramePanel>
              </Frame>
            </section>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Notas / mensagens</h2>
              <div className="mt-3 flex gap-2">
                <Button variant={mode === "publica" ? "primary" : "secondary"} size="sm" type="button" onClick={() => setMode("publica")}>
                  WhatsApp
                </Button>
                <Button variant={mode === "interna" ? "primary" : "secondary"} size="sm" type="button" onClick={() => setMode("interna")}>
                  Nota interna
                </Button>
              </div>
              {mode === "publica" ? (
                <p className="mt-2 text-xs text-[var(--muted)]">A mensagem pública sai no WhatsApp na hora, se a sessão estiver conectada.</p>
              ) : null}
              {send.isError ? <ErrorBanner message={(send.error as Error).message} /> : null}
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!body.trim() && !file) return;
                  send.mutate();
                }}
              >
                <Input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={mode === "interna" ? "Escreva uma nota…" : "Mensagem para o WhatsApp"}
                  aria-label="Mensagem do chamado"
                />
                {mode === "publica" ? (
                  <input
                    type="file"
                    className="w-full text-sm"
                    accept="image/jpeg,image/png,application/pdf,audio/ogg,audio/mpeg,audio/mp4,audio/webm"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                ) : null}
                <Button type="submit" disabled={send.isPending || (!body.trim() && !file)}>
                  {mode === "publica" ? "Enviar" : "Salvar nota"}
                </Button>
              </form>
            </section>
            <section>
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Documentos</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.documents.length === 0 ? "Nenhum documento ainda" : `${t.documents.length} arquivo${t.documents.length === 1 ? "" : "s"}`}
                </p>
                {t.documents.length > 0 ? (
                  <ul className="mt-2">
                    {t.documents.map((d) => (
                      <li key={d.id}>
                        <FileItem
                          name={d.originalName}
                          sizeBytes={d.sizeBytes}
                          actions={
                            <>
                              <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                                Baixar
                              </a>
                              <button type="button" className="text-primary" disabled={sendDoc.isPending} onClick={() => sendDoc.mutate(d.id)}>
                                Enviar WhatsApp
                              </button>
                            </>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button className="mt-3" type="button" variant="secondary" onClick={() => setOpenDocModal(true)}>
                  Enviar arquivo
                </Button>
              </section>
          </div>
          <aside className="space-y-4 lg:border-l lg:border-[var(--border)] lg:pl-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Informações</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Condomínio</dt>
                <dd>{t.condominium.nome}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Responsável</dt>
                <dd>{t.assignedTo?.nome || t.assignedTo?.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Prioridade</dt>
                <dd>{PRIORITY_LABEL[t.priority] || t.priority}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Categoria</dt>
                <dd>{CATEGORY_LABEL[t.category] || t.category}</dd>
              </div>
            </dl>
            <Accordion title="Mais informações">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[var(--muted)]">Contato</dt>
                  <dd>
                    {t.contact.nome} · {t.contact.phoneE164}
                  </dd>
                </div>
                {t.conversation ? (
                  <div>
                    <dt className="text-[var(--muted)]">Origem</dt>
                    <dd>{t.conversation.connection.label}</dd>
                  </div>
                ) : null}
              </dl>
            </Accordion>
            <form
              className="space-y-2 border-t border-[var(--border)] pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                patch.mutate();
              }}
            >
              <Input value={title || t.title} onChange={(e) => setTitle(e.target.value)} aria-label="Título" />
              <Select value={priority || t.priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridade">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
              <Select value={category || t.category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
              {admin ? (
                <Select value={assignedToId || t.assignedTo?.id || ""} onChange={(e) => setAssignedToId(e.target.value)} aria-label="Responsável">
                  <option value="">Sem responsável</option>
                  {(team.data?.data ?? [])
                    .filter((m) => m.ativo)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome || m.email}
                      </option>
                    ))}
                </Select>
              ) : null}
              <Select value={status || t.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" disabled={patch.isPending}>
                Salvar
              </Button>
              {patch.isError ? <p className="text-sm text-[var(--danger)]">{(patch.error as Error).message}</p> : null}
            </form>
            {admin ? (
              <Frame>
                <FramePanel>
                  <FrameHeader>
                    <FrameTitle>Histórico técnico</FrameTitle>
                  </FrameHeader>
                  <div className="px-4 pb-4">
                    {(audit.data?.data ?? []).length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">Sem eventos.</p>
                    ) : (
                      <ul className="space-y-2 text-xs">
                        {(audit.data?.data ?? []).map((a) => (
                          <li key={a.id}>
                            {formatWhen(a.createdAt)} · {a.actor.email} · {a.action}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </FramePanel>
              </Frame>
            ) : null}
          </aside>
        </div>
        <Dialog open={openDocModal} onClose={closeDocModal} title="Enviar arquivo">
          <p className="text-sm text-[var(--muted)]">JPEG, PNG, PDF ou áudio · até 8 MB</p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pendingFile) return;
              upload.mutate(pendingFile);
            }}
          >
            <div>
              <Label htmlFor="ticket-doc-file">Arquivo</Label>
              <input
                id="ticket-doc-file"
                ref={fileInputRef}
                type="file"
                className="mt-1 w-full text-sm"
                accept="image/jpeg,image/png,application/pdf,audio/*"
                onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
              />
              {pendingFile ? (
                <p className="mt-2 text-sm">
                  {pendingFile.name} · {formatBytes(pendingFile.size)}
                </p>
              ) : null}
            </div>
            {upload.isError ? <ErrorBanner message={(upload.error as Error).message} /> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeDocModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!pendingFile || upload.isPending}>
                {upload.isPending ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </form>
        </Dialog>
      </>
      )}
    </div>
  );
}
