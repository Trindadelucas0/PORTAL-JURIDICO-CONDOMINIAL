"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageBubbles, type MessageBubbleItem } from "@/components/atendimento/message-bubbles";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { conversationPhoneLabel } from "@/lib/phone/display";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";

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
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<Member[]>("/api/team") });
  const patch = useMutation({
    mutationFn: (body: unknown) => api(`/api/triage/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_, body) => {
      qc.invalidateQueries({ queryKey: ["triage"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      const action = (body as { action?: string }).action;
      if (action === "promote") {
        toast("Chamado criado");
        onDone?.();
        router.push("/chamados");
      } else if (action === "archive") {
        toast("Solicitação arquivada");
        onDone?.();
        router.push("/triagem");
      }
    },
  });

  if (itemQ.isLoading) return <Skeleton className="h-48 m-3" />;
  if (itemQ.isError) {
    return (
      <div className="p-3">
        <ErrorBanner message="Falha ao carregar análise." onRetry={() => itemQ.refetch()} />
      </div>
    );
  }

  const item = itemQ.data?.data;
  if (!item) return <EmptyState title="Solicitação não encontrada" />;

  const members = (team.data?.data ?? []).filter((m) => m.ativo);
  const threadTitle = item.conversation.contact?.nome || "Solicitação";
  const threadSub = `${item.conversation.condominium?.nome || "sem condomínio"} · ${conversationPhoneLabel(item.conversation.contact?.phoneE164, item.conversation.peerPhoneE164)}`;
  const messages = messagesQ.data?.data ?? [];
  const canPromote = Boolean(item.conversation.contact && item.conversation.condominium);

  return (
    <div className={showThread ? "grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_240px]" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
      {showThread ? (
        <section className="flex min-h-0 flex-col overflow-hidden border-r border-border" aria-label="Mensagens">
          <div className="shrink-0 border-b border-border px-3 py-2">
            <p className="font-medium">{threadTitle}</p>
            <p className="truncate text-xs text-muted-foreground">{threadSub}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {messagesQ.isLoading ? <Skeleton className="h-20" /> : null}
            {messagesQ.isError ? (
              <ErrorBanner message="Falha ao carregar mensagens." onRetry={() => messagesQ.refetch()} />
            ) : null}
            {!messagesQ.isLoading && !messagesQ.isError && messages.length === 0 ? (
              <EmptyState title="Sem mensagens ainda" hint="Quando o WhatsApp entregar texto, ele aparece aqui." />
            ) : null}
            {!messagesQ.isLoading && !messagesQ.isError && messages.length > 0 ? (
              <MessageBubbles messages={messages} />
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="min-h-0 space-y-3 overflow-y-auto p-3">
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Análise</h2>
        <div className="flex items-center gap-3">
          <PeerAvatar
            name={item.conversation.contact?.nome || item.conversation.peerDisplayName || "Contato"}
            avatarUrl={item.conversation.peerAvatarUrl}
            size="lg"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Contato</p>
            <p className="font-medium">{item.conversation.contact?.nome}</p>
            <p className="text-xs text-muted-foreground">
              {conversationPhoneLabel(item.conversation.contact?.phoneE164, item.conversation.peerPhoneE164)}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Condomínio</p>
          <p>{item.conversation.condominium?.nome}</p>
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
        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            className="w-full"
            disabled={!canPromote || patch.isPending}
            onClick={() =>
              patch.mutate({
                action: "promote",
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
