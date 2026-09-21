"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { FileItem } from "@/components/ui/file-item";
import { PriorityIndicator, StatusBadge } from "@/components/ui/status-badge";
import { SectionTabPanel, SectionTabs } from "@/components/ui/section-tabs";
import { DocumentFichaForm } from "@/components/documentos/document-ficha-form";
import { MessageComposer } from "@/components/atendimento/message-composer";
import { MessageBubbles, type MessageBubbleItem } from "@/components/atendimento/message-bubbles";
import { ApprovalPanel } from "@/components/workspace/approval-panel";
import { ContextBlock, ContextSummary } from "@/components/workspace/context-summary";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { documentKindLabel } from "@/lib/documents/kinds";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  TICKET_STATUSES,
  STATUS_LABEL,
  formatDue,
  formatWhen,
  isOverdue,
} from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";
import { formatWhatsAppPeer } from "@/lib/phone/display";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { peerAvatarPublicUrl } from "@/lib/phone/avatar-url";
import { cn } from "@/lib/utils";

type Deadline = { id: string; title: string; dueAt: string; doneAt: string | null; kind: string };

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
  contact: { nome: string; phoneE164: string; avatarKey?: string | null };
  conversation: {
    connection: { status: string; label: string; type: string };
    peerAvatarKey?: string | null;
    peerDisplayName?: string | null;
  } | null;
  documents: Array<{
    id: string;
    originalName: string;
    title?: string;
    kind?: string;
    sizeBytes: number;
    ingestStatus: string;
    storageKey: string;
    createdAt?: string;
  }>;
  deadlines: Deadline[];
  messages: Array<{ id: string; body: string; sendStatus: string }>;
};

type Msg = MessageBubbleItem;

export default function ChamadoFichaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("resumo");
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
    ...livePollQuery,
  });

  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [openDocModal, setOpenDocModal] = useState(false);
  const [openDeadline, setOpenDeadline] = useState(false);
  const [deadlineTitle, setDeadlineTitle] = useState("");
  const [deadlineDue, setDeadlineDue] = useState("");
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
    mutationFn: (input: { body: string; visibility: "publica" | "interna"; file: File | null }) => {
      const form = new FormData();
      form.append("body", input.body);
      form.append("visibility", input.visibility);
      if (input.file) form.append("file", input.file);
      return api(`/api/tickets/${id}/messages`, { method: "POST", body: form });
    },
    onSuccess: (_res, vars) => {
      toast(vars.visibility === "interna" ? "Nota salva" : vars.body ? "Mensagem registrada" : "Arquivo enviado");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
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
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
  const upload = useMutation({
    mutationFn: async (values: {
      kind: string;
      title: string;
      purpose: string;
      notes: string;
      file: File;
    }) => {
      const form = new FormData();
      form.append("file", values.file);
      form.append("kind", values.kind);
      form.append("title", values.title);
      form.append("purpose", values.purpose);
      if (values.notes) form.append("notes", values.notes);
      form.append("ticketId", id);
      return api("/api/documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      toast("Documento salvo");
      setOpenDocModal(false);
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
  const sendDoc = useMutation({
    mutationFn: (docId: string) => api(`/api/documents/${docId}/send-draft`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast("Documento enviado no WhatsApp");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
    },
  });
  const createDeadline = useMutation({
    mutationFn: () =>
      api("/api/deadlines", {
        method: "POST",
        body: JSON.stringify({
          ticketId: id,
          title: deadlineTitle,
          dueAt: new Date(deadlineDue).toISOString(),
          kind: "atendimento",
        }),
      }),
    onSuccess: () => {
      toast("Prazo adicionado");
      setOpenDeadline(false);
      setDeadlineTitle("");
      setDeadlineDue("");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const doneDeadline = useMutation({
    mutationFn: (deadlineId: string) =>
      api(`/api/deadlines/${deadlineId}`, { method: "PATCH", body: JSON.stringify({ done: true }) }),
    onSuccess: () => {
      toast("Prazo concluído");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const approve = useMutation({
    mutationFn: (messageId: string) => api(`/api/messages/${messageId}/approve`, { method: "POST" }),
    onSuccess: () => {
      toast("Mensagem enviada");
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });

  const timeline = useMemo(() => {
    const t = ticket.data?.data;
    const items: TimelineItem[] = [];
    for (const m of messages.data?.data ?? []) {
      const interna = m.visibility === "interna";
      items.push({
        id: m.id,
        kind: interna ? "note" : m.sendStatus === "draft" ? "approval" : "message",
        body: m.body,
        at: m.createdAt,
        label: interna
          ? "Nota interna"
          : m.sendStatus === "draft"
            ? "Rascunho"
            : m.direction === "in"
              ? "Cliente"
              : "WhatsApp",
        tone: interna ? "interna" : m.sendStatus === "draft" ? "draft" : m.sendStatus === "failed" ? "failed" : m.direction === "in" ? "in" : "out",
      });
    }
    for (const a of audit.data?.data ?? []) {
      items.push({
        id: a.id,
        kind: a.action.includes("assign") ? "assignee" : a.action.includes("status") ? "status" : "system",
        body: a.action,
        at: a.createdAt,
        author: a.actor.email,
        label: "Auditoria",
      });
    }
    for (const d of t?.documents ?? []) {
      items.push({
        id: `doc-${d.id}`,
        kind: "document",
        body: d.title || d.originalName,
        at: d.createdAt || t?.createdAt || new Date().toISOString(),
        label: d.kind ? documentKindLabel(d.kind) : "Documento",
      });
    }
    for (const d of t?.deadlines ?? []) {
      items.push({
        id: `dl-${d.id}`,
        kind: "deadline",
        body: `${d.title} · ${formatDue(d.dueAt)}${d.doneAt ? " · concluído" : ""}`,
        at: d.doneAt || d.dueAt,
        label: "Prazo",
      });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 40);
  }, [messages.data, audit.data, ticket.data]);

  if (ticket.isError) {
    const statusCode = (ticket.error as Error & { status?: number }).status;
    if (statusCode === 403) return <ForbiddenState message="Sem permissão para este chamado." />;
    if (statusCode === 404) return <p className="p-4 text-muted-foreground">Chamado não encontrado.</p>;
    return (
      <div className="p-4">
        <ErrorBanner message="Falha ao carregar chamado." onRetry={() => ticket.refetch()} />
      </div>
    );
  }

  const t = ticket.data?.data;
  const admin = me.data?.data.user.role === "admin";
  const user = me.data?.data.user;
  const nextOpenDeadline = t?.deadlines.find((d) => !d.doneAt);

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <Link href="/chamados" className="text-sm text-[var(--brand)]">
          ← Chamados
        </Link>
        {ticket.isLoading || !t ? (
          <Skeleton className="mt-2 h-8 w-48" />
        ) : (
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tabular">#{t.protocol}</h1>
                <StatusBadge status={t.status} />
                <PriorityIndicator priority={t.priority} />
              </div>
              <p className="mt-0.5 text-sm">{t.title}</p>
              <p className="text-xs text-muted-foreground">
                {t.condominium.nome} · {t.contact.nome}
                {t.assignedTo ? ` · ${t.assignedTo.nome || t.assignedTo.email}` : " · sem responsável"}
                {nextOpenDeadline
                  ? ` · prazo ${formatDue(nextOpenDeadline.dueAt)}`
                  : ""}
              </p>
            </div>
          </div>
        )}
      </header>
      {ticket.isLoading || !t ? (
        <Skeleton className="m-4 h-48" />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <SectionTabs
              tabs={[
                { id: "resumo", label: "Resumo" },
                { id: "atividade", label: "Atividade" },
                { id: "documentos", label: "Documentos", count: t.documents.length },
                { id: "comunicacao", label: "Comunicação" },
              ]}
              value={tab}
              onChange={setTab}
            />
            <SectionTabPanel id="resumo" active={tab === "resumo"} className="min-h-0 flex-1 overflow-y-auto p-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Categoria</dt>
                  <dd>{CATEGORY_LABEL[t.category] || t.category}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd>{STATUS_LABEL[t.status] || t.status}</dd>
                </div>
              </dl>
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Prazos</h2>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setOpenDeadline(true)}>
                    Adicionar prazo
                  </Button>
                </div>
                {t.deadlines.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nenhum prazo neste chamado.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {t.deadlines.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <span className="font-medium">{d.title}</span>
                          <span
                            className={cn(
                              "ml-2 tabular text-xs",
                              isOverdue(d.dueAt, d.doneAt) ? "text-[var(--danger)]" : "text-muted-foreground",
                            )}
                          >
                            {formatDue(d.dueAt)}
                            {d.doneAt ? " · concluído" : ""}
                          </span>
                        </span>
                        {!d.doneAt ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={doneDeadline.isPending}
                            onClick={() => doneDeadline.mutate(d.id)}
                          >
                            Concluir
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <form
                className="mt-6 max-w-md space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  patch.mutate();
                }}
              >
                <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Cadastro</h2>
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
                  <Select
                    value={assignedToId || t.assignedTo?.id || ""}
                    onChange={(e) => setAssignedToId(e.target.value)}
                    aria-label="Responsável"
                  >
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
            </SectionTabPanel>
            <SectionTabPanel id="atividade" active={tab === "atividade"} className="min-h-0 flex-1 overflow-y-auto p-4">
              {messages.isLoading ? <Skeleton className="h-24" /> : <Timeline items={timeline} />}
            </SectionTabPanel>
            <SectionTabPanel id="documentos" active={tab === "documentos"} className="min-h-0 flex-1 overflow-y-auto p-4">
              {t.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum documento ainda.</p>
              ) : (
                <ul>
                  {t.documents.map((d) => (
                    <li key={d.id}>
                      <FileItem
                        name={d.title || d.originalName}
                        sizeBytes={d.sizeBytes}
                        meta={d.kind ? documentKindLabel(d.kind) : undefined}
                        actions={
                          <>
                            <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                              Baixar
                            </a>
                            <button
                              type="button"
                              className="text-primary"
                              disabled={sendDoc.isPending}
                              onClick={() => sendDoc.mutate(d.id)}
                            >
                              Enviar WhatsApp
                            </button>
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              <Button className="mt-3" type="button" variant="secondary" size="sm" onClick={() => setOpenDocModal(true)}>
                Novo documento
              </Button>
            </SectionTabPanel>
            <SectionTabPanel id="comunicacao" active={tab === "comunicacao"} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {messages.isLoading ? <Skeleton className="h-24" /> : null}
                {!messages.isLoading ? (
                  <MessageBubbles
                    messages={messages.data?.data ?? []}
                    onResend={admin ? (mid) => approve.mutate(mid) : undefined}
                    resendPending={approve.isPending}
                  />
                ) : null}
              </div>
              {admin
                ? (messages.data?.data ?? [])
                    .filter((m) => m.visibility === "publica" && m.sendStatus === "draft")
                    .slice(0, 1)
                    .map((m) => (
                      <ApprovalPanel
                        key={m.id}
                        className="mx-3 mb-2"
                        body={m.body}
                        pending={approve.isPending}
                        onApprove={() => approve.mutate(m.id)}
                      />
                    ))
                : null}
              {t.conversationId ? (
                <MessageComposer
                  user={user}
                  allowPublicSend={t.conversation?.connection.status === "open"}
                  publicBlockedHint={
                    t.conversation?.connection.status !== "open" ? "WhatsApp não está conectado." : null
                  }
                  pending={send.isPending}
                  error={send.isError ? (send.error as Error).message : null}
                  onSend={(input) => send.mutate(input)}
                />
              ) : (
                <p className="border-t border-border p-3 text-sm text-muted-foreground">
                  Este chamado não tem conversa WhatsApp vinculada.
                </p>
              )}
            </SectionTabPanel>
          </div>
          <ContextSummary title="Contexto" className="hidden border-l border-border lg:flex">
            <div className="space-y-4">
              <ContextBlock label="Condomínio">
                <Link className="text-[var(--brand)]" href={`/condominios/${t.condominium.id}`}>
                  {t.condominium.nome}
                </Link>
              </ContextBlock>
              <ContextBlock label="Contato">
                <span className="flex items-center gap-2">
                  <PeerAvatar
                    name={t.contact.nome}
                    avatarUrl={
                      peerAvatarPublicUrl(t.contact.avatarKey) || peerAvatarPublicUrl(t.conversation?.peerAvatarKey)
                    }
                    className="size-7"
                  />
                  <span>
                    {t.contact.nome}
                    <span className="block text-xs text-muted-foreground">{formatWhatsAppPeer(t.contact.phoneE164)}</span>
                  </span>
                </span>
              </ContextBlock>
              <ContextBlock label="Responsável">{t.assignedTo?.nome || t.assignedTo?.email || "—"}</ContextBlock>
              {nextOpenDeadline ? (
                <ContextBlock label="Próximo prazo">
                  <span className={isOverdue(nextOpenDeadline.dueAt, nextOpenDeadline.doneAt) ? "text-[var(--danger)]" : undefined}>
                    {nextOpenDeadline.title} · {formatDue(nextOpenDeadline.dueAt)}
                  </span>
                </ContextBlock>
              ) : null}
              {t.conversation ? <ContextBlock label="Origem">{t.conversation.connection.label}</ContextBlock> : null}
            </div>
          </ContextSummary>
        </div>
      )}
      <Dialog open={openDocModal} onClose={() => setOpenDocModal(false)} title="Novo documento">
        <DocumentFichaForm
          showTicketSelect={false}
          pending={upload.isPending}
          errorMessage={upload.isError ? (upload.error as Error).message : null}
          onCancel={() => setOpenDocModal(false)}
          onSubmit={(values) => {
            if (!values.file) return;
            upload.mutate({
              kind: values.kind,
              title: values.title,
              purpose: values.purpose,
              notes: values.notes,
              file: values.file,
            });
          }}
        />
      </Dialog>
      <Dialog open={openDeadline} onClose={() => setOpenDeadline(false)} title="Adicionar prazo">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createDeadline.mutate();
          }}
        >
          <div>
            <Label htmlFor="dl-title">Título</Label>
            <Input id="dl-title" required value={deadlineTitle} onChange={(e) => setDeadlineTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dl-due">Data</Label>
            <Input id="dl-due" type="datetime-local" required value={deadlineDue} onChange={(e) => setDeadlineDue(e.target.value)} />
          </div>
          {createDeadline.isError ? (
            <p className="text-sm text-[var(--danger)]">{(createDeadline.error as Error).message}</p>
          ) : null}
          <Button type="submit" disabled={createDeadline.isPending}>
            Salvar prazo
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
