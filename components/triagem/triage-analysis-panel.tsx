"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MessageBubbles, type MessageBubbleItem } from "@/components/atendimento/message-bubbles";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { useSyncOwnMessages } from "@/lib/client/sync-own-messages";
import { useScrollThreadToEnd } from "@/lib/client/stick-thread-scroll";
import { conversationPhoneLabel } from "@/lib/phone/display";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  status: string;
  conversationId: string;
  conversation: {
    peerPhoneE164?: string;
    peerDisplayName?: string | null;
    peerAvatarUrl?: string | null;
    contact: { nome: string; phoneE164: string; avatarKey?: string | null } | null;
    condominium: { nome: string } | null;
  };
};

type Member = { id: string; email: string; nome?: string; role: string; ativo: boolean };

function defaultTitle(contactName: string | undefined, category: string) {
  const label = CATEGORY_LABEL[category] || category;
  return contactName ? `${contactName} — ${label}` : label;
}

export function TriageAnalysisPanel({
  id,
  showThread = true,
  onDone,
}: {
  id: string;
  showThread?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [category, setCategory] = useState("outro");
  const [priority, setPriority] = useState("media");
  const [assignedToId, setAssignedToId] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const itemQ = useQuery({
    queryKey: ["triage", id],
    queryFn: () => api<Item>(`/api/triage/${id}`),
  });
  const conversationId = itemQ.data?.data?.conversationId;
  const messagesQ = useQuery({
    queryKey: ["messages", conversationId],
    enabled: Boolean(conversationId) && showThread,
    queryFn: () => api<MessageBubbleItem[]>(`/api/conversations/${conversationId}/messages?pageSize=50`),
    ...livePollQuery,
  });
  useSyncOwnMessages(showThread ? conversationId : undefined);
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<Member[]>("/api/team") });
  const patch = useMutation({
    mutationFn: (body: unknown) =>
      api<{ id: string }>(`/api/triage/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (res, body) => {
      qc.invalidateQueries({ queryKey: ["triage"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      const action = (body as { action?: string }).action;
      if (action === "promote") {
        toast("Chamado criado");
        onDone?.();
        router.push(`/chamados/${res.data.id}`);
      } else if (action === "archive") {
        toast("Solicitação arquivada");
        onDone?.();
        router.push("/triagem");
      }
    },
  });

  const item = itemQ.data?.data;
  const contactName = item?.conversation.contact?.nome;

  useEffect(() => {
    setCategory("outro");
    setPriority("media");
    setAssignedToId("");
    setTitleTouched(false);
    setTitle(defaultTitle(contactName, "outro"));
  }, [id, contactName]);

  useEffect(() => {
    if (titleTouched || !contactName) return;
    setTitle(defaultTitle(contactName, category));
  }, [category, contactName, titleTouched]);

  const messages = messagesQ.data?.data ?? [];
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const { onScroll: onThreadScroll } = useScrollThreadToEnd(threadScrollRef, {
    conversationKey: conversationId,
    lastMessageId: messages[messages.length - 1]?.id ?? null,
    messageCount: messages.length,
  });

  if (itemQ.isLoading) return <Skeleton className="h-48 m-3" />;
  if (itemQ.isError) {
    return (
      <div className="p-3">
        <ErrorBanner message="Falha ao carregar análise." onRetry={() => itemQ.refetch()} />
      </div>
    );
  }

  if (!item) return <EmptyState title="Solicitação não encontrada" />;

  const members = (team.data?.data ?? []).filter((m) => m.ativo);
  const threadTitle = item.conversation.contact?.nome || "Solicitação";
  const threadSub = `${item.conversation.condominium?.nome || "sem condomínio"} · ${conversationPhoneLabel(item.conversation.contact?.phoneE164, item.conversation.peerPhoneE164)}`;
  const canPromote = Boolean(item.conversation.contact && item.conversation.condominium);
  const titleOk = title.trim().length >= 3;

  const classification = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <h2 className="text-sm font-semibold">Classificação</h2>
        <div className="flex items-center gap-2">
          <PeerAvatar
            name={item.conversation.contact?.nome || item.conversation.peerDisplayName || "Contato"}
            avatarUrl={item.conversation.peerAvatarUrl}
            className="size-8"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.conversation.contact?.nome}</p>
            <p className="truncate text-xs text-muted-foreground">
              {conversationPhoneLabel(item.conversation.contact?.phoneE164, item.conversation.peerPhoneE164)}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Condomínio</p>
          <p className="truncate text-sm">{item.conversation.condominium?.nome}</p>
        </div>
        <div>
          <Label htmlFor={`title-${id}`}>Título</Label>
          <Input
            id={`title-${id}`}
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => {
              setTitleTouched(true);
              setTitle(e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor={`cat-${id}`}>Categoria</Label>
          <Select id={`cat-${id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`pri-${id}`}>Prioridade</Label>
          <Select id={`pri-${id}`} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((c) => (
              <option key={c} value={c}>
                {PRIORITY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`asg-${id}`}>Responsável</Label>
          <Select id={`asg-${id}`} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome || m.email}
              </option>
            ))}
          </Select>
        </div>
        {patch.isError ? <p className="text-sm text-[var(--danger)]">{(patch.error as Error).message}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
        <Button
          type="button"
          className="w-full"
          disabled={!canPromote || !titleOk || patch.isPending}
          onClick={() =>
            patch.mutate({
              action: "promote",
              title: title.trim(),
              category,
              priority,
              assignedToId: assignedToId || null,
            })
          }
        >
          Criar chamado
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => setConfirmArchive(true)}>
          Arquivar
        </Button>
      </div>
    </section>
  );

  const thread = showThread ? (
    <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label="Mensagens">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <PeerAvatar
          name={item.conversation.contact?.nome || item.conversation.peerDisplayName || "Contato"}
          avatarUrl={item.conversation.peerAvatarUrl}
          className="size-8"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{threadTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{threadSub}</p>
          <p className="truncate text-[11px] text-muted-foreground">A resposta ao cliente fica no Atendimento.</p>
        </div>
      </div>
      <div
        ref={threadScrollRef}
        onScroll={onThreadScroll}
        className="overflow-anchor-none min-h-0 flex-1 overflow-y-auto bg-[var(--chat-wallpaper)] px-4 py-3"
      >
        {messagesQ.isLoading ? <Skeleton className="h-20" /> : null}
        {messagesQ.isError ? (
          <ErrorBanner message="Falha ao carregar mensagens." onRetry={() => messagesQ.refetch()} />
        ) : null}
        {!messagesQ.isLoading && !messagesQ.isError && messages.length === 0 ? (
          <EmptyState title="Sem mensagens ainda" hint="Quando o WhatsApp entregar texto, ele aparece aqui." />
        ) : null}
        {!messagesQ.isLoading && !messagesQ.isError && messages.length > 0 ? (
          <div data-thread-scroll-content>
            <MessageBubbles messages={messages} />
          </div>
        ) : null}
      </div>
    </section>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          showThread
            ? "grid h-full min-h-0 flex-1 grid-rows-[minmax(0,40%)_minmax(0,1fr)] gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)]"
            : "flex h-full min-h-0 flex-1 flex-col overflow-hidden",
        )}
      >
        {showThread ? (
          <>
            <div className="order-1 h-full min-h-0 overflow-hidden lg:order-2 lg:border-l lg:border-border">
              {classification}
            </div>
            <div className="order-2 h-full min-h-0 overflow-hidden border-t border-border lg:order-1 lg:border-t-0">
              {thread}
            </div>
          </>
        ) : (
          classification
        )}
      </div>
      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Arquivar solicitação"
        message="A triagem será fechada sem criar chamado."
        confirmLabel="Arquivar"
        danger
        onConfirm={() => patch.mutate({ action: "archive" })}
      />
    </div>
  );
}
