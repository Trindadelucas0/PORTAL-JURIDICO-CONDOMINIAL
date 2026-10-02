"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageComposer } from "@/components/atendimento/message-composer";
import { ApprovalPanel } from "@/components/workspace/approval-panel";
import { presentCopilotRevision, type CopilotIndex } from "@/lib/ai/copilot-view";
import { SELECTED_MESSAGE_LIMIT } from "@/lib/ai/package";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  MessageBubbles,
  pickApprovalDraft,
  sentPublicBodies,
  type MessageBubbleItem,
} from "@/components/atendimento/message-bubbles";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { useScrollThreadToEnd } from "@/lib/client/stick-thread-scroll";
import { useSyncOwnMessages } from "@/lib/client/sync-own-messages";
import { cn } from "@/lib/utils";
import { conversationPhoneLabel } from "@/lib/phone/display";

export type ThreadConversation = {
  id: string;
  unidentified: boolean;
  peerPhoneE164?: string;
  peerDisplayName?: string | null;
  peerAvatarUrl?: string | null;
  contact: { nome: string; phoneE164: string; avatarKey?: string | null } | null;
  condominium: { nome: string } | null;
  connection: { status: string; type: string; label: string };
};

type Message = MessageBubbleItem;

const NO_SELECTION: ReadonlySet<string> = new Set();

type ReadBag = { id: string | null; ids: string[]; lastReadAt: string | null };

/** Não abertas desta visita: as do `POST .../read` mais inbound chegadas depois do corte novo; as 40 mais novas. */
function relatoIdsFor(bag: ReadBag, messages: Message[]): string[] {
  const cutoff = bag.lastReadAt ? new Date(bag.lastReadAt).getTime() : null;
  const after =
    cutoff == null
      ? []
      : messages.filter((m) => m.direction === "in" && new Date(m.createdAt).getTime() > cutoff).map((m) => m.id);
  return [...new Set([...bag.ids, ...after])].slice(-SELECTED_MESSAGE_LIMIT);
}

function mergeById(older: Message[], newer: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of older) map.set(m.id, m);
  for (const m of newer) map.set(m.id, m);
  return [...map.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function ThreadPanel({
  conversation,
  hidden,
  onBack,
  onContext,
  showContext = true,
  title,
  subtitle,
  besideName,
  allowPublicSend,
  publicBlockedHint,
  extraInvalidateKeys = [],
  showAiActions = false,
}: {
  conversation?: ThreadConversation;
  hidden: boolean;
  onBack: () => void;
  onContext?: () => void;
  showContext?: boolean;
  title: string;
  subtitle?: string;
  besideName?: ReactNode;
  allowPublicSend: boolean;
  publicBlockedHint?: string | null;
  extraInvalidateKeys?: unknown[][];
  showAiActions?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const conversationId = conversation?.id ?? null;
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [olderBag, setOlderBag] = useState<{ id: string | null; messages: Message[]; page: number }>({
    id: conversationId,
    messages: [],
    page: 1,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [selectionBag, setSelectionBag] = useState<{ id: string | null; ids: ReadonlySet<string> }>({
    id: conversationId,
    ids: new Set(),
  });
  const [readBag, setReadBag] = useState<ReadBag>({ id: conversationId, ids: [], lastReadAt: null });
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const versionAtClick = useRef<number | null>(null);
  const [esperando, setEsperando] = useState(false);
  const [readyToSettle, setReadyToSettle] = useState(false);

  const older = olderBag.id === conversationId ? olderBag.messages : [];
  const olderPage = olderBag.id === conversationId ? olderBag.page : 1;
  const selectedIds = selectionBag.id === conversationId ? selectionBag.ids : NO_SELECTION;

  const toggleSelect = useCallback(
    (messageId: string) => {
      setSelectionBag((prev) => {
        const ids = new Set(prev.id === conversationId ? prev.ids : []);
        if (ids.has(messageId)) ids.delete(messageId);
        else ids.add(messageId);
        return { id: conversationId, ids };
      });
    },
    [conversationId],
  );

  useLayoutEffect(() => {
    if (olderBag.id === conversationId) return;
    setOlderBag({ id: conversationId, messages: [], page: 1 });
    setSelectionBag({ id: conversationId, ids: new Set() });
    setReadBag({ id: conversationId, ids: [], lastReadAt: null });
    setOlderError(null);
    setReplyTo(null);
    setEsperando(false);
    setReadyToSettle(false);
    versionAtClick.current = null;
  }, [conversationId, olderBag.id]);

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    enabled: Boolean(conversationId),
    queryFn: () => api<Message[]>(`/api/conversations/${conversationId}/messages?pageSize=50`),
    ...livePollQuery,
  });

  const aiSummary = useQuery({
    queryKey: ["conversation-ai-summary", conversationId],
    enabled: Boolean(showAiActions && conversationId),
    queryFn: () => api<CopilotIndex>(`/api/conversations/${conversationId}/ai-summary`),
    ...livePollQuery,
  });
  const aiOn = Boolean(showAiActions && aiSummary.data?.data.enabled);
  const aiAnalyzing = Boolean(aiSummary.data?.data.analyzing);
  const aiFailed = Boolean(aiSummary.data?.data.error) || aiSummary.isError;
  const aiVersion = aiSummary.data?.data.currentVersion ?? null;
  const aiCurrent = aiOn && aiSummary.data?.data.current ? presentCopilotRevision(aiSummary.data.data.current) : null;
  const suggested = aiCurrent?.resposta.texto?.trim() ?? "";
  const runAi = useMutation({
    mutationFn: (body: { messageIds: string[]; relatoMessageIds: string[] }) =>
      api(`/api/conversations/${conversationId}/ai-run`, { method: "POST", body: JSON.stringify(body) }),
    onMutate: () => {
      versionAtClick.current = aiSummary.data?.data.currentVersion ?? null;
      setReadyToSettle(false);
      setEsperando(true);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.refetchQueries({ queryKey: ["conversation-ai-summary", conversationId] }),
        qc.refetchQueries({ queryKey: ["messages", conversationId] }),
      ]);
      setReadyToSettle(true);
    },
    onError: (error) => {
      setEsperando(false);
      setReadyToSettle(false);
      toast(error instanceof Error ? error.message : "Não foi possível rodar a IA");
    },
  });
  const gerando = runAi.isPending || aiAnalyzing || esperando;

  useEffect(() => {
    if (!esperando || !readyToSettle || runAi.isPending || aiAnalyzing) return;
    setEsperando(false);
    setReadyToSettle(false);
    void qc.refetchQueries({ queryKey: ["messages", conversationId] });
    const had = versionAtClick.current;
    if (aiFailed) {
      toast(
        had != null || aiVersion != null
          ? "A nova análise não foi gerada. O texto abaixo é da versão anterior."
          : "Não foi possível gerar o resumo.",
      );
      return;
    }
    if (aiVersion != null && (had == null || aiVersion > had)) {
      toast("Resumo gerado");
      return;
    }
    toast("O resumo destas mensagens já existe.");
  }, [esperando, readyToSettle, runAi.isPending, aiAnalyzing, aiFailed, aiVersion, toast, qc, conversationId]);

  useSyncOwnMessages(conversationId ?? undefined);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ user: { apenasRascunho: boolean; podeResponderCliente: boolean; role: string } }>("/api/auth/me"),
  });

  const recent = messages.data?.data ?? [];
  const total = Number(messages.data?.meta?.total ?? recent.length);
  const allMessages = useMemo(() => mergeById(older, recent), [older, recent]);
  const sentBodies = useMemo(() => sentPublicBodies(allMessages), [allMessages]);
  const approvalDraft = useMemo(
    () => pickApprovalDraft(allMessages, sentBodies, suggested),
    [allMessages, sentBodies, suggested],
  );
  const hasMore = total > allMessages.length;
  const lastMessageId = allMessages[allMessages.length - 1]?.id ?? null;
  const relatoIds = useMemo(
    () => (readBag.id === conversationId ? relatoIdsFor(readBag, allMessages) : []),
    [readBag, conversationId, allMessages],
  );
  const onlyRelato = selectedIds.size === 0 && relatoIds.length > 0;

  const { onScroll, stickToBottom, releaseStick } = useScrollThreadToEnd(scrollRef, {
    conversationKey: conversationId,
    lastMessageId,
    messageCount: allMessages.length,
  });

  const send = useMutation({
    mutationFn: (input: { body: string; visibility: "publica" | "interna"; file: File | null }) => {
      const form = new FormData();
      form.append("body", input.body);
      form.append("visibility", input.visibility);
      if (input.file) form.append("file", input.file);
      if (replyTo) form.append("replyToId", replyTo.id);
      return api(`/api/conversations/${conversationId}/messages`, { method: "POST", body: form });
    },
    onSuccess: () => {
      setReplyTo(null);
      stickToBottom();
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      for (const key of extraInvalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });
  const resend = useMutation({
    mutationFn: (messageId: string) => api(`/api/messages/${messageId}/approve`, { method: "POST" }),
    onSuccess: () => {
      stickToBottom();
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });
  useEffect(() => {
    if (!conversationId) return;
    void api<{ lastReadAt: string; unopenedMessageIds?: string[] }>(`/api/conversations/${conversationId}/read`, {
      method: "POST",
      body: JSON.stringify({}),
    }).then((res) => {
      const ids = res.data?.unopenedMessageIds ?? [];
      setReadBag((prev) =>
        prev.id === conversationId
          ? { id: conversationId, ids: [...new Set([...prev.ids, ...ids])], lastReadAt: res.data?.lastReadAt ?? prev.lastReadAt }
          : prev,
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    });
  }, [conversationId, qc]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore) return;
    const el = scrollRef.current;
    if (el) prevScrollHeightRef.current = el.scrollHeight;
    releaseStick();
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const nextPage = olderPage + 1;
      const res = await api<Message[]>(
        `/api/conversations/${conversationId}/messages?page=${nextPage}&pageSize=50`,
      );
      const chunk = res.data ?? [];
      setOlderBag((prev) => ({
        id: conversationId,
        messages: mergeById(chunk, prev.id === conversationId ? prev.messages : []),
        page: nextPage,
      }));
    } catch (err) {
      setOlderError(err instanceof Error ? err.message : "Falha ao carregar mensagens anteriores.");
      prevScrollHeightRef.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, hasMore, olderPage, releaseStick]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevScrollHeightRef.current == null) return;
    const delta = el.scrollHeight - prevScrollHeightRef.current;
    el.scrollTop += delta;
    prevScrollHeightRef.current = null;
  }, [allMessages]);

  const user = me.data?.data.user;
  const canApprove = user?.role === "admin";
  const canResendFailed = Boolean(
    user && (user.role === "admin" || (user.podeResponderCliente && !user.apenasRascunho)),
  );

  return (
    <section className={cn("flex h-full min-h-0 flex-col overflow-hidden", hidden && "hidden lg:flex")}>
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button type="button" className="text-sm text-[var(--brand)] lg:hidden" onClick={onBack}>
          ← Conversas
        </button>
        {!conversation ? (
          <p className="text-sm text-[var(--muted)]">Selecione uma conversa</p>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <PeerAvatar name={title} avatarUrl={conversation.peerAvatarUrl} className="size-8" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-medium">{title}</p>
                {besideName}
              </div>
              <p className="truncate text-xs text-[var(--muted)]">
                {subtitle ||
                  conversationPhoneLabel(conversation.contact?.phoneE164, conversation.peerPhoneE164)}
                {conversation.connection.type === "dev_mock" ? (
                  <Badge className="ml-2" tone="dev">
                    DEV
                  </Badge>
                ) : null}
              </p>
            </div>
          </div>
        )}
        {aiOn ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!conversation}
              onClick={() => {
                const el = document.getElementById("resumo-ia");
                el?.scrollIntoView({ block: "nearest" });
                el?.focus();
              }}
            >
              Resumo IA
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-busy={gerando}
              disabled={
                !conversation || gerando || (selectedIds.size === 0 && relatoIds.length === 0)
              }
              onClick={() => runAi.mutate({ messageIds: [...selectedIds], relatoMessageIds: relatoIds })}
            >
              {gerando ? (
                <>
                  <Loader2Icon className="animate-spin" />
                  Gerando…
                </>
              ) : onlyRelato ? (
                "Gerar resumo"
              ) : (
                `Gerar resumo (${selectedIds.size})`
              )}
            </Button>
          </div>
        ) : null}
        {showContext && onContext ? (
          <button
            type="button"
            className="text-sm text-[var(--brand)] xl:hidden"
            onClick={onContext}
            disabled={!conversation}
          >
            Contexto
          </button>
        ) : null}
      </div>
      {!conversation ? (
        <EmptyState title="Selecione uma conversa" />
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="overflow-anchor-none min-h-0 flex-1 overflow-y-auto bg-[var(--chat-wallpaper)] px-4 py-3"
          >
            {messages.isLoading ? <Skeleton className="h-20" /> : null}
            {!messages.isLoading ? (
              <div data-thread-scroll-content>
                {hasMore ? (
                  <div className="mb-3 flex justify-center">
                    <button
                      type="button"
                      className="text-xs text-[var(--brand)] underline disabled:opacity-50"
                      disabled={loadingOlder}
                      onClick={() => void loadOlder()}
                    >
                      {loadingOlder ? "Carregando…" : "Carregar anteriores"}
                    </button>
                  </div>
                ) : null}
                {olderError ? <ErrorBanner message={olderError} onRetry={() => void loadOlder()} /> : null}
                <MessageBubbles
                  messages={allMessages}
                  suggestedText={suggested}
                  onReply={(m) => setReplyTo(m)}
                  onResend={canResendFailed ? (id) => resend.mutate(id) : undefined}
                  onApproveDraft={canApprove ? (id) => resend.mutate(id) : undefined}
                  resendPending={resend.isPending}
                  selectedIds={aiOn ? selectedIds : undefined}
                  onToggleSelect={aiOn ? toggleSelect : undefined}
                />
              </div>
            ) : null}
          </div>
          {canApprove && approvalDraft ? (
            <ApprovalPanel
              key={approvalDraft.id}
              className="mx-3 mb-2"
              body={approvalDraft.body}
              pending={resend.isPending}
              error={resend.isError ? (resend.error as Error).message : null}
              onApprove={() => resend.mutate(approvalDraft.id)}
            />
          ) : null}
          {replyTo ? (
            <div className="flex items-center justify-between border-t border-border bg-[var(--page)] px-3 py-2 text-xs">
              <span className="truncate">Responder: {replyTo.body}</span>
              <button type="button" className="shrink-0 text-muted-foreground" onClick={() => setReplyTo(null)}>
                ×
              </button>
            </div>
          ) : null}
          {resend.isError && !canApprove ? <ErrorBanner message={(resend.error as Error).message} /> : null}
          <MessageComposer
            user={user}
            allowPublicSend={allowPublicSend}
            publicBlockedHint={publicBlockedHint}
            pending={send.isPending}
            error={send.isError ? (send.error as Error).message : null}
            onSend={(input) => send.mutate(input)}
          />
        </>
      )}
    </section>
  );
}
