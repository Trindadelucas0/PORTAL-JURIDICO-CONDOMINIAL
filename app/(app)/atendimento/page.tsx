"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { ThreadPanel, type ThreadConversation } from "@/components/atendimento/thread-panel";
import { AiContextSummary } from "@/components/atendimento/ai-context-summary";
import { WorkspacePane, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { cn } from "@/lib/utils";
import { conversationIdentityLabel, conversationPhoneLabel } from "@/lib/phone/display";
import { ExpandableRow } from "@/components/ui/expandable-row";
import { ContextBlock, ContextSummary } from "@/components/workspace/context-summary";
import { formatAge, STATUS_TONE } from "@/lib/ui-labels";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { TicketEditDrawer, type EditTicketValues } from "@/components/chamados/ticket-edit-drawer";
import Link from "next/link";

type ConversationTicket = { id: string; protocol: string; status: string; updatedAt?: string };

type Conversation = ThreadConversation & {
  unread?: boolean;
  unopenedMessages?: number;
  updatedAt: string;
  peerAvatarUrl?: string | null;
  peerDisplayName?: string | null;
  triageItem: { id: string; status: string } | null;
  tickets?: ConversationTicket[];
  messages: { body: string }[];
};

type EditTicket = {
  id: string;
  title: string;
  priority: string;
  category: string;
  status: string;
  assignedTo: { id: string } | null;
};

type Filter = "all" | "unread" | "triage";

/** Mais recente não resolvido; se todos resolvidos, o mais recente. Lista já vem orderBy updatedAt desc. */
function pickTicketForCard(tickets: ConversationTicket[] | undefined): ConversationTicket | undefined {
  if (!tickets?.length) return undefined;
  return tickets.find((t) => t.status !== "resolvido") ?? tickets[0];
}

function InboxInner() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState<Filter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [editTicketId, setEditTicketId] = useState<string | null>(null);
  const [contextWide, setContextWide] = useState(false);
  const list = useQuery({
    queryKey: ["conversations", q, filter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (filter === "unread") p.set("unread", "1");
      if (filter === "triage") p.set("untreated", "1");
      return api<Conversation[]>(`/api/conversations?${p.toString()}`);
    },
    ...livePollQuery,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_res, id) => {
      if (selected === id) {
        setSelected(null);
        setMobilePane("list");
      }
      toast("Conversa excluída do sistema");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["messages", id] });
      qc.invalidateQueries({ queryKey: ["triage"] });
    },
    onError: (error) => {
      toast((error as Error).message || "Não foi possível excluir a conversa");
    },
  });
  const items = list.data?.data ?? [];
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = selected || current?.id;

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ user: { role: string; podeResponderCliente: boolean; apenasRascunho: boolean } }>("/api/auth/me"),
  });
  const meUser = me.data?.data.user;
  const admin = meUser?.role === "admin";
  const canSend = Boolean(meUser && (meUser.role === "admin" || (meUser.podeResponderCliente && !meUser.apenasRascunho)));
  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => api<Array<{ id: string; email: string; nome?: string; ativo: boolean }>>("/api/team"),
    enabled: Boolean(admin && editTicketId),
  });
  const editTicket = useQuery({
    queryKey: ["ticket", editTicketId],
    enabled: Boolean(editTicketId),
    queryFn: () => api<EditTicket>(`/api/tickets/${editTicketId}`),
  });
  const patchTicket = useMutation({
    mutationFn: (values: EditTicketValues) => {
      if (!editTicketId) throw new Error("Chamado não selecionado");
      return api(`/api/tickets/${editTicketId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: values.status,
          title: values.title,
          priority: values.priority,
          category: values.category,
          assignedToId: values.assignedToId || null,
        }),
      });
    },
    onSuccess: () => {
      const id = editTicketId;
      toast("Chamado atualizado");
      setEditTicketId(null);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      if (id) qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (list.isError) {
    return (
      <div className="p-4">
        <ErrorBanner message="Não foi possível carregar conversas." onRetry={() => list.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Atendimento</h1>
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Fila de entrada</p>
        </div>
        <FilterBar className="ml-auto sm:ml-0">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            Todas
          </FilterChip>
          <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
            Não lidas
          </FilterChip>
          <FilterChip active={filter === "triage"} onClick={() => setFilter("triage")}>
            Triagem
          </FilterChip>
        </FilterBar>
      </div>
      <WorkspaceShell cols="inbox" contextOpen contextWide={contextWide}>
        <WorkspacePane className={cn(mobilePane !== "list" && "hidden lg:flex")}>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <p className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Conversas</p>
            <Input
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar conversas"
              className="h-8"
            />
            {list.isLoading ? (
              <div className="mt-2 space-y-1">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState title="Tudo limpo" hint="Nenhuma conversa no fluxo." />
            ) : (
              <ul className="escalonar mt-2 space-y-1.5">
                {items.map((c, index) => {
                  const ticket = pickTicketForCard(c.tickets);
                  const inTriage = c.triageItem?.status === "aberto";
                  return (
                  <li key={c.id} className="relative" style={{ "--stagger-i": index } as React.CSSProperties}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-[var(--radius)] border border-border border-l-2 px-2 py-2 pr-9 text-left text-sm transition-colors duration-[var(--motion-fast)]",
                        currentId === c.id
                          ? "border-l-primary bg-[color-mix(in_srgb,var(--brand)_6%,white)]"
                          : "border-l-transparent bg-card hover:border-[var(--border-strong)]",
                      )}
                      onClick={() => {
                        setSelected(c.id);
                        setMobilePane("thread");
                      }}
                    >
                      <PeerAvatar
                        className="mt-0.5 size-7"
                        name={c.contact?.nome || c.peerDisplayName || "Contato"}
                        avatarUrl={c.peerAvatarUrl}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {c.contact?.nome || c.peerDisplayName || conversationIdentityLabel(c)}
                          </span>
                          {(c.unopenedMessages ?? 0) > 0 ? (
                            <>
                              <span className="shrink-0 text-[10px] font-medium tracking-wide text-primary uppercase">
                                Não aberta
                              </span>
                              <span className="shrink-0 tabular text-[11px] font-semibold text-primary">
                                {c.unopenedMessages}
                              </span>
                            </>
                          ) : null}
                          <span className="shrink-0 tabular text-[11px] text-muted-foreground">
                            {formatAge(c.updatedAt) ?? ""}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {conversationPhoneLabel(c.contact?.phoneE164, c.peerPhoneE164)}
                          {c.condominium?.nome ? ` · ${c.condominium.nome}` : ""}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {c.messages[0]?.body || "—"}
                        </span>
                        {inTriage || ticket ? (
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {inTriage ? (
                              <span className="text-[10px] font-medium tracking-wide text-[var(--warn)] uppercase">
                                Triagem
                              </span>
                            ) : null}
                            {ticket ? (
                              <>
                                <span className="text-[10px] font-medium tabular text-muted-foreground">
                                  #{ticket.protocol}
                                </span>
                                <StatusBadge status={ticket.status} />
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="absolute top-1 right-0.5 inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-[var(--danger)]"
                      aria-label={`Excluir conversa de ${c.contact?.nome || c.peerDisplayName || conversationIdentityLabel(c)} só do sistema`}
                      title="Excluir do sistema"
                      onClick={() => setPendingDelete(c)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </WorkspacePane>
        <WorkspacePane className={cn("min-w-0", mobilePane !== "thread" && "hidden lg:flex")}>
          <ThreadPanel
            conversation={current}
            hidden={mobilePane !== "thread"}
            onBack={() => setMobilePane("list")}
            showContext={false}
            title={
              current
                ? current.contact?.nome || current.peerDisplayName || conversationIdentityLabel(current)
                : "Contato"
            }
            subtitle={
              current
                ? `${conversationPhoneLabel(current.contact?.phoneE164, current.peerPhoneE164)} · ${current.condominium?.nome || "sem condomínio"} · ${current.connection.label}`
                : undefined
            }
            allowPublicSend={Boolean(current && current.connection.status === "open")}
            publicBlockedHint={
              current && current.connection.status !== "open" ? "WhatsApp não está conectado." : null
            }
            showAiActions
          />
        </WorkspacePane>
        <WorkspacePane>
          <ContextPane
            conversation={current}
            onEditTicket={setEditTicketId}
            wide={contextWide}
            onToggleWide={() => setContextWide((value) => !value)}
            canSend={canSend}
          />
        </WorkspacePane>
      </WorkspaceShell>
      <TicketEditDrawer
        open={Boolean(editTicketId)}
        onClose={() => setEditTicketId(null)}
        ticket={editTicket.data?.data ?? null}
        admin={Boolean(admin)}
        team={team.data?.data ?? []}
        pending={patchTicket.isPending || editTicket.isLoading}
        errorMessage={
          patchTicket.isError
            ? (patchTicket.error as Error).message
            : editTicket.isError
              ? (editTicket.error as Error).message
              : null
        }
        onSave={(values) => patchTicket.mutate(values)}
      />
      <ConfirmDialog
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="Excluir conversa do sistema"
        message="Tira esta conversa só do Juricon. O WhatsApp no celular permanece. O chamado, se houver, permanece. As mensagens desta conversa saem da ficha do chamado."
        confirmLabel="Excluir do sistema"
        danger
        pending={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}

const CONTEXT_CARD = "min-w-0 rounded-[8px] border border-border bg-card p-3";

function ContextPane({
  conversation,
  onEditTicket,
  wide,
  onToggleWide,
  canSend,
}: {
  conversation?: Conversation;
  onEditTicket: (id: string) => void;
  wide: boolean;
  onToggleWide: () => void;
  canSend: boolean;
}) {
  const ticketTone = conversation
    ? STATUS_TONE[pickTicketForCard(conversation.tickets)?.status ?? ""]
    : undefined;
  const triageTone = conversation?.triageItem
    ? STATUS_TONE[conversation.triageItem.status]
    : undefined;
  return (
    <ContextSummary wide={wide} onToggleWide={onToggleWide}>
      {!conversation ? (
        <p className="text-muted-foreground">Selecione uma conversa.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Contexto do contato</p>
          <div className={cn(CONTEXT_CARD, "flex min-w-0 items-center gap-3")}>
            <PeerAvatar
              name={conversation.contact?.nome || conversation.peerDisplayName || "Contato"}
              avatarUrl={conversation.peerAvatarUrl}
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Contato</p>
              <p className="font-medium break-words">
                {conversation.contact?.nome || conversation.peerDisplayName || "Contato"}
              </p>
              <p className="text-xs text-muted-foreground">
                {conversationPhoneLabel(conversation.contact?.phoneE164, conversation.peerPhoneE164)}
              </p>
            </div>
          </div>
          <AiContextSummary conversationId={conversation.id} canSend={canSend} />
          <div
            className={
              conversation.condominium?.nome
                ? cn(
                    "min-w-0 rounded-[8px] border p-3",
                    "border-[color-mix(in_srgb,var(--brand)_25%,white)]",
                    "bg-[color-mix(in_srgb,var(--brand)_8%,white)]",
                  )
                : CONTEXT_CARD
            }
          >
            <ContextBlock label="Condomínio" className={conversation.condominium?.nome ? "text-[var(--brand)]" : undefined}>
              {conversation.condominium?.nome ? (
                <Link href="/condominios" className="text-[var(--brand)]">
                  {conversation.condominium.nome}
                </Link>
              ) : (
                <p>—</p>
              )}
            </ContextBlock>
          </div>
          <div
            className={
              ticketTone
                ? cn("min-w-0 rounded-[8px] border border-border p-3", ticketTone.column)
                : CONTEXT_CARD
            }
          >
            <ContextBlock label="Chamado" className={ticketTone?.header}>
              {conversation.tickets?.length ? (
                <div className="space-y-2">
                  {conversation.tickets.map((t) => (
                    <Link
                      key={t.id}
                      className="flex flex-wrap items-center gap-2 text-[var(--brand)]"
                      href={`/chamados/${t.id}`}
                    >
                      #{t.protocol}
                      <StatusBadge status={t.status} />
                    </Link>
                  ))}
                  {pickTicketForCard(conversation.tickets) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        const ticket = pickTicketForCard(conversation.tickets);
                        if (ticket) onEditTicket(ticket.id);
                      }}
                    >
                      <Pencil data-icon="inline-start" />
                      Atualizar chamado
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum chamado ainda</p>
              )}
            </ContextBlock>
          </div>
          <div
            className={
              triageTone
                ? cn("min-w-0 rounded-[8px] border border-border p-3", triageTone.column)
                : CONTEXT_CARD
            }
          >
            <ContextBlock label="Triagem" className={triageTone?.header}>
              {conversation.triageItem ? (
                <p className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={conversation.triageItem.status} />
                  {conversation.triageItem.status === "aberto" ? (
                    <Link className="text-[var(--brand)]" href={`/triagem/${conversation.triageItem.id}`}>
                      Analisar
                    </Link>
                  ) : null}
                </p>
              ) : (
                <p>—</p>
              )}
            </ContextBlock>
          </div>
          <ExpandableRow
            title="Mais informações"
            summary="Histórico e documentos no chamado"
            className="rounded-[8px] border border-border bg-card px-3"
          >
            <p className="text-xs text-muted-foreground">
              Documentos e prazos ficam na ficha do chamado. Origem: {conversation.connection.label}.
            </p>
          </ExpandableRow>
        </div>
      )}
    </ContextSummary>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <InboxInner />
    </Suspense>
  );
}
