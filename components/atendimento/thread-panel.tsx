"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageComposer } from "@/components/atendimento/message-composer";
import { ApprovalPanel } from "@/components/workspace/approval-panel";
import { MessageBubbles, type MessageBubbleItem } from "@/components/atendimento/message-bubbles";
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
}) {
  const qc = useQueryClient();
  const conversationId = conversation?.id ?? null;
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [olderBag, setOlderBag] = useState<{ id: string | null; messages: Message[]; page: number }>({
    id: conversationId,
    messages: [],
    page: 1,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);

  const older = olderBag.id === conversationId ? olderBag.messages : [];
  const olderPage = olderBag.id === conversationId ? olderBag.page : 1;

  useLayoutEffect(() => {
    if (olderBag.id === conversationId) return;
    setOlderBag({ id: conversationId, messages: [], page: 1 });
    setOlderError(null);
    setReplyTo(null);
  }, [conversationId, olderBag.id]);

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    enabled: Boolean(conversationId),
    queryFn: () => api<Message[]>(`/api/conversations/${conversationId}/messages?pageSize=50`),
    ...livePollQuery,
  });

  useSyncOwnMessages(conversationId ?? undefined);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ user: { apenasRascunho: boolean; podeResponderCliente: boolean; role: string } }>("/api/auth/me"),
  });

  const recent = messages.data?.data ?? [];
  const total = Number(messages.data?.meta?.total ?? recent.length);
  const allMessages = useMemo(() => mergeById(older, recent), [older, recent]);
  const hasMore = total > allMessages.length;
  const lastMessageId = allMessages[allMessages.length - 1]?.id ?? null;

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
    void api(`/api/conversations/${conversationId}/read`, { method: "POST", body: JSON.stringify({}) }).then(() => {
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
            className="overflow-anchor-none min-h-0 flex-1 overflow-y-auto px-4 py-3"
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
                  onReply={(m) => setReplyTo(m)}
                  onResend={canApprove ? (id) => resend.mutate(id) : undefined}
                  resendPending={resend.isPending}
                />
              </div>
            ) : null}
          </div>
          {canApprove
            ? allMessages
                .filter((m) => m.visibility === "publica" && m.sendStatus === "draft")
                .slice(0, 1)
                .map((m) => (
                  <ApprovalPanel
                    key={m.id}
                    className="mx-3 mb-2"
                    body={m.body}
                    pending={resend.isPending}
                    error={resend.isError ? (resend.error as Error).message : null}
                    onApprove={() => resend.mutate(m.id)}
                  />
                ))
            : null}
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
