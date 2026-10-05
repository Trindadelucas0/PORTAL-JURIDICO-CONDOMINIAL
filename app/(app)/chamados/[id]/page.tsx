"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { FileItem } from "@/components/ui/file-item";
import { SectionTabPanel, SectionTabs } from "@/components/ui/section-tabs";
import { MessageComposer } from "@/components/atendimento/message-composer";
import {
  isHiddenReviewDraft,
  isRedundantAiDraft,
  MessageBubbles,
  sentPublicBodies,
  type MessageBubbleItem,
} from "@/components/atendimento/message-bubbles";
import { ApprovalPanel } from "@/components/workspace/approval-panel";
import { AiAuditPanel, type AiAuditRow } from "@/components/chamados/ai-audit-panel";
import { AiSummarySheet } from "@/components/chamados/ai-summary-sheet";
import { TicketAiShadow } from "@/components/chamados/ticket-ai-shadow";
import { presentCopilotRevision, type CopilotIndex } from "@/lib/ai/copilot-view";
import { TicketDossieHeader } from "@/components/chamados/ticket-dossie-header";
import { TicketCasePanel } from "@/components/chamados/ticket-case-panel";
import { TicketEditDrawer } from "@/components/chamados/ticket-edit-drawer";
import {
  TicketContextContent,
  TicketContextRail,
} from "@/components/chamados/ticket-context-rail";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { useSyncOwnMessages } from "@/lib/client/sync-own-messages";
import { useScrollThreadToEnd } from "@/lib/client/stick-thread-scroll";
import { documentKindLabel } from "@/lib/documents/kinds";
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
    clientSendable?: boolean;
    ticketId?: string | null;
  }>;
  messages: Array<{ id: string; body: string; sendStatus: string }>;
};

type Msg = MessageBubbleItem;

export default function ChamadoFichaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("caso");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDetalhes, setOpenDetalhes] = useState(false);

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
  useSyncOwnMessages(ticket.data?.data.conversationId ?? undefined);

  const threadMessages = messages.data?.data ?? [];
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const { onScroll: onThreadScroll, stickToBottom } = useScrollThreadToEnd(threadScrollRef, {
    conversationKey: ticket.data?.data.conversationId,
    lastMessageId: threadMessages[threadMessages.length - 1]?.id ?? null,
    messageCount: threadMessages.length,
  });

  const aiSummary = useQuery({
    queryKey: ["ticket-ai-summary", id],
    queryFn: () => api<CopilotIndex>(`/api/tickets/${id}/ai-summary`),
    ...livePollQuery,
  });
  const aiEnabled = Boolean(aiSummary.data?.data.enabled);
  const aiCurrent = aiEnabled ? aiSummary.data?.data.current ?? null : null;
  const suggested = aiCurrent ? presentCopilotRevision(aiCurrent).resposta.texto?.trim() ?? "" : "";
  const sentBodies = useMemo(() => sentPublicBodies(messages.data?.data ?? []), [messages.data]);
  const runAi = useMutation({
    mutationFn: () => api(`/api/tickets/${id}/ai-run`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      setSummaryOpen(true);
      void qc.invalidateQueries({ queryKey: ["ticket-ai-summary", id] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Não foi possível rodar a IA"),
  });
  const aiAudit = useQuery({
    queryKey: ["ticket-ai-audit", id],
    enabled: aiEnabled && tab === "auditoria",
    queryFn: () => api<{ enabled: boolean; events: AiAuditRow[]; tokensToday?: number }>(`/api/tickets/${id}/ai-audit`),
  });
  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => api<Array<{ id: string; email: string; nome?: string; ativo: boolean }>>("/api/team"),
    enabled: Boolean(me.data?.data.user.role === "admin"),
  });
  const audit = useQuery({
    queryKey: ["audit", "ticket", id],
    enabled: Boolean(me.data?.data.user.role === "admin"),
    queryFn: () =>
      api<Array<{ id: string; action: string; createdAt: string; actor: { email: string } | null }>>(
        `/api/audit?entityType=ticket&entityId=${id}`,
      ),
  });

  const sendDoc = useMutation({
    mutationFn: (documentId: string) => api(`/api/documents/${documentId}/send-draft`, { method: "POST" }),
    onSuccess: () => {
      toast("Documento enviado no WhatsApp.");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
    },
    onError: (error) => toast((error as Error).message),
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
      stickToBottom();
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const patch = useMutation({
    mutationFn: (values: {
      title: string;
      priority: string;
      category: string;
      status: string;
      assignedToId: string;
    }) =>
      api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: values.status,
          title: values.title,
          priority: values.priority,
          category: values.category,
          assignedToId: values.assignedToId || null,
        }),
      }),
    onSuccess: () => {
      toast("Chamado atualizado");
      setOpenEdit(false);
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
  const rejectDraft = useMutation({
    mutationFn: (messageId: string) => api(`/api/messages/${messageId}/reject`, { method: "POST" }),
    onSuccess: () => {
      toast("Rascunho rejeitado");
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
      qc.invalidateQueries({ queryKey: ["ticket-ai-audit", id] });
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
            : m.automated
              ? "Automático"
              : m.direction === "in"
                ? "Cliente"
                : "WhatsApp",
        tone: interna
          ? "interna"
          : m.sendStatus === "draft"
            ? "draft"
            : m.sendStatus === "failed"
              ? "failed"
              : m.direction === "in"
                ? "in"
                : "out",
      });
    }
    for (const a of audit.data?.data ?? []) {
      items.push({
        id: a.id,
        kind: a.action.includes("assign") ? "assignee" : a.action.includes("status") ? "status" : "system",
        body: a.action,
        at: a.createdAt,
        author: a.actor?.email ?? "Sistema",
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
  const canResendFailed = Boolean(
    user && (user.role === "admin" || (user.podeResponderCliente && !user.apenasRascunho)),
  );
  const contextTicket = t
    ? {
        condominium: t.condominium,
        contact: t.contact,
        assignedTo: t.assignedTo,
        conversation: t.conversation
          ? { connection: { label: t.conversation.connection.label }, peerAvatarKey: t.conversation.peerAvatarKey }
          : null,
      }
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)]">
      <TicketDossieHeader
        loading={ticket.isLoading || !t}
        ticket={
          t
            ? {
                protocol: t.protocol,
                title: t.title,
                status: t.status,
                priority: t.priority,
                condominium: t.condominium,
                contact: t.contact,
                assignedTo: t.assignedTo,
              }
            : null
        }
        onEdit={() => setOpenEdit(true)}
        onDetalhes={() => setOpenDetalhes(true)}
        aiAnalyzing={aiEnabled && Boolean(aiSummary.data?.data.analyzing)}
        showAi={aiEnabled}
        onResumo={() => setSummaryOpen(true)}
        onRun={() => runAi.mutate()}
        runPending={runAi.isPending}
      />
      {ticket.isLoading || !t || !contextTicket ? (
        <Skeleton className="m-4 h-48" />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <SectionTabs
              className="shrink-0 overflow-x-auto"
              tabs={[
                { id: "caso", label: "Caso" },
                { id: "atividade", label: "Linha do tempo" },
                { id: "documentos", label: "Documentos", count: t.documents.length },
                { id: "comunicacao", label: "Comunicação" },
                ...(aiEnabled
                  ? [
                      { id: "resumo", label: "Resumo IA" },
                      { id: "auditoria", label: "Auditoria" },
                    ]
                  : []),
              ]}
              value={tab}
              onChange={(next) => {
                if (next === "resumo") {
                  setSummaryOpen(true);
                  return;
                }
                setTab(next);
              }}
            />
            <SectionTabPanel id="caso" active={tab === "caso"} className="min-h-0 flex-1 overflow-y-auto p-4">
              <TicketAiShadow
                loading={aiSummary.isLoading}
                error={aiSummary.isError}
                analyzing={Boolean(aiSummary.data?.data.analyzing)}
                current={aiSummary.data?.data.current ?? null}
              />
              <TicketCasePanel
                category={t.category}
                createdAt={t.createdAt}
              />
            </SectionTabPanel>
            <SectionTabPanel id="atividade" active={tab === "atividade"} className="min-h-0 flex-1 overflow-y-auto p-4">
              {messages.isLoading ? <Skeleton className="h-24" /> : <Timeline items={timeline} />}
            </SectionTabPanel>
            <SectionTabPanel id="documentos" active={tab === "documentos"} className="min-h-0 flex-1 overflow-y-auto p-4">
              {t.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum documento ainda.
                  <span className="mt-1 block">Os arquivos ficam em Documentos, na pasta do condomínio.</span>
                </p>
              ) : (
                <ul>
                  {t.documents.map((d) => (
                    <li key={d.id}>
                      <FileItem
                        name={d.title || d.originalName}
                        sizeBytes={d.sizeBytes}
                        meta={d.kind ? documentKindLabel(d.kind) : undefined}
                        actions={
                          <span className="flex gap-3">
                            <a className="text-primary" href={`/api/files/${d.storageKey}`}>
                              Baixar
                            </a>
                            {d.clientSendable ? (
                              <button
                                type="button"
                                className="text-primary disabled:opacity-50"
                                disabled={sendDoc.isPending}
                                onClick={() => sendDoc.mutate(d.id)}
                              >
                                Enviar
                              </button>
                            ) : null}
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </SectionTabPanel>
            <SectionTabPanel id="comunicacao" active={tab === "comunicacao"} className="flex min-h-0 flex-1 flex-col">
              <div
                ref={threadScrollRef}
                onScroll={onThreadScroll}
                className="overflow-anchor-none min-h-0 flex-1 overflow-y-auto bg-[var(--chat-wallpaper)] px-4 py-3"
              >
                {messages.isLoading ? <Skeleton className="h-24" /> : null}
                {!messages.isLoading ? (
                  <div data-thread-scroll-content>
                    <MessageBubbles
                      messages={threadMessages}
                      suggestedText={suggested}
                      onResend={canResendFailed ? (mid) => approve.mutate(mid) : undefined}
                      onApproveDraft={admin ? (mid) => approve.mutate(mid) : undefined}
                      resendPending={approve.isPending}
                    />
                  </div>
                ) : null}
              </div>
              {admin
                ? threadMessages
                    .filter(
                      (m) =>
                        m.visibility === "publica" &&
                        m.sendStatus === "draft" &&
                        !isHiddenReviewDraft(m) &&
                        !isRedundantAiDraft(m, { sentBodies, suggestedText: suggested }),
                    )
                    .slice(0, 1)
                    .map((m) => (
                      <ApprovalPanel
                        key={m.id}
                        className="mx-3 mb-2"
                        body={m.body}
                        pending={approve.isPending || rejectDraft.isPending}
                        error={rejectDraft.isError ? (rejectDraft.error as Error).message : null}
                        onApprove={() => approve.mutate(m.id)}
                        onReject={() => rejectDraft.mutate(m.id)}
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
            <SectionTabPanel id="auditoria" active={tab === "auditoria"} className="min-h-0 flex-1 overflow-y-auto p-4">
              <AiAuditPanel
                loading={aiAudit.isLoading}
                error={aiAudit.isError}
                events={aiAudit.data?.data.events ?? []}
                tokensToday={aiAudit.data?.data.tokensToday}
              />
            </SectionTabPanel>
          </div>
          <TicketContextRail ticket={contextTicket} className="hidden border-l border-border lg:flex" />
        </div>
      )}

      <AiSummarySheet
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        loading={aiSummary.isLoading}
        error={Boolean(aiSummary.data?.data.error) || aiSummary.isError}
        analyzing={Boolean(aiSummary.data?.data.analyzing)}
        current={aiSummary.data?.data.current ?? null}
        history={aiSummary.data?.data.history ?? []}
        currentVersion={aiSummary.data?.data.currentVersion ?? null}
        summaryPath={`/api/tickets/${id}/ai-summary`}
        protocol={t?.protocol}
        condominiumName={t?.condominium.nome}
        draftPath={t?.conversationId ? `/api/tickets/${id}/ai-draft` : ""}
        canSend={Boolean(user && user.role === "admin")}
        onShowConversation={() => setTab("comunicacao")}
        onRun={() => runAi.mutate()}
        runPending={runAi.isPending}
      />

      <TicketEditDrawer
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        ticket={t ?? null}
        admin={Boolean(admin)}
        team={team.data?.data ?? []}
        pending={patch.isPending}
        errorMessage={patch.isError ? (patch.error as Error).message : null}
        onSave={(values) => patch.mutate(values)}
      />

      <Drawer open={openDetalhes} onClose={() => setOpenDetalhes(false)} title="Detalhes">
        {contextTicket ? <TicketContextContent ticket={contextTicket} /> : null}
      </Drawer>
    </div>
  );
}
