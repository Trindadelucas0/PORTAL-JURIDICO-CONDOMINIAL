"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

export function ThreadPanel({
  conversation,
  hidden,
  onBack,
  onContext,
  title,
  subtitle,
  allowPublicSend,
  publicBlockedHint,
  extraInvalidateKeys = [],
}: {
  conversation?: ThreadConversation;
  hidden: boolean;
  onBack: () => void;
  onContext: () => void;
  title: string;
  subtitle?: string;
  allowPublicSend: boolean;
  publicBlockedHint?: string | null;
  extraInvalidateKeys?: unknown[][];
}) {
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messages = useQuery({
    queryKey: ["messages", conversation?.id],
    enabled: Boolean(conversation?.id),
    queryFn: () => api<Message[]>(`/api/conversations/${conversation!.id}/messages?pageSize=50`),
    ...livePollQuery,
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ user: { apenasRascunho: boolean; podeResponderCliente: boolean; role: string } }>("/api/auth/me"),
  });
  const send = useMutation({
    mutationFn: (input: { body: string; visibility: "publica" | "interna"; file: File | null }) => {
      const form = new FormData();
      form.append("body", input.body);
      form.append("visibility", input.visibility);
      if (input.file) form.append("file", input.file);
      if (replyTo) form.append("replyToId", replyTo.id);
      return api(`/api/conversations/${conversation!.id}/messages`, { method: "POST", body: form });
    },
    onSuccess: () => {
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["messages", conversation?.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      for (const key of extraInvalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversation?.id] });
    },
  });
  const resend = useMutation({
    mutationFn: (messageId: string) => api(`/api/messages/${messageId}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversation?.id] });
    },
  });
  useEffect(() => {
    if (!conversation?.id) return;
    void api(`/api/conversations/${conversation.id}/read`, { method: "POST", body: JSON.stringify({}) }).then(() => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    });
  }, [conversation?.id, qc]);

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
              <p className="font-medium">{title}</p>
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
        <button type="button" className="text-sm text-[var(--brand)] xl:hidden" onClick={onContext} disabled={!conversation}>
          Contexto
        </button>
      </div>
      {!conversation ? (
        <EmptyState title="Selecione uma conversa" />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {messages.isLoading ? <Skeleton className="h-20" /> : null}
            {!messages.isLoading ? (
              <MessageBubbles
                messages={messages.data?.data ?? []}
                onReply={(m) => setReplyTo(m)}
                onResend={canApprove ? (id) => resend.mutate(id) : undefined}
                resendPending={resend.isPending}
              />
            ) : null}
          </div>
          {canApprove
            ? (messages.data?.data ?? [])
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
