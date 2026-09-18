"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { MessageBubbles, type MessageBubbleItem } from "@/components/atendimento/message-bubbles";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client/api";
import { conversationPhoneLabel } from "@/lib/phone/display";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL } from "@/lib/ui-labels";
import { useToast } from "@/components/ui/toast";

type Item = {
  id: string;
  status: string;
  conversationId: string;
  conversation: {
    peerPhoneE164?: string;
    contact: { nome: string; phoneE164: string } | null;
    condominium: { nome: string } | null;
  };
};

type Member = { id: string; email: string; nome?: string; role: string; ativo: boolean };

export default function TriagemAnalisePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
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
    enabled: Boolean(conversationId),
    queryFn: () => api<MessageBubbleItem[]>(`/api/conversations/${conversationId}/messages?pageSize=50`),
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
        router.push("/chamados");
      } else if (action === "archive") {
        toast("Solicitação arquivada");
        router.push("/triagem");
      }
    },
  });

  if (itemQ.isError) {
    const status = (itemQ.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState />;
    if (status === 404) return <EmptyState title="Solicitação não encontrada" />;
    return <ErrorBanner message="Falha ao carregar análise." onRetry={() => itemQ.refetch()} />;
  }

  const item = itemQ.data?.data;
  const members = (team.data?.data ?? []).filter((m) => m.ativo);
  const threadTitle = item?.conversation.contact?.nome || "Solicitação";
  const threadSub = item
    ? `${item.conversation.condominium?.nome || "sem condomínio"} · ${conversationPhoneLabel(item.conversation.contact?.phoneE164, item.conversation.peerPhoneE164)}`
    : undefined;
  const messages = messagesQ.data?.data ?? [];
  const canPromote = Boolean(item?.conversation.contact && item.conversation.condominium);

  return (
    <div>
      <PageHeader
        back={
          <Link href="/triagem" className="text-sm text-[var(--brand)]">
            ← Triagem
          </Link>
        }
        title={item ? threadTitle : "Analisar"}
        description={threadSub}
      />
      {itemQ.isLoading || !item ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            className="flex min-h-[50vh] flex-col overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] lg:min-h-[24rem]"
            aria-label="Mensagens da conversa"
          >
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="font-medium">{threadTitle}</p>
              <p className="truncate text-xs text-[var(--muted)]">{threadSub}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {messagesQ.isLoading ? <Skeleton className="h-20" /> : null}
              {messagesQ.isError ? (
                <ErrorBanner message="Falha ao carregar mensagens." onRetry={() => messagesQ.refetch()} />
              ) : null}
              {!messagesQ.isLoading && !messagesQ.isError && messages.length === 0 ? (
                <EmptyState
                  title="Ainda não há mensagens neste inbound."
                  hint="Quando o WhatsApp entregar texto, ele aparece aqui em ordem cronológica."
                />
              ) : null}
              {!messagesQ.isLoading && !messagesQ.isError && messages.length > 0 ? (
                <MessageBubbles messages={messages} />
              ) : null}
            </div>
          </section>
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Classificar</h2>
            <div>
              <p className="text-xs text-[var(--muted)]">Contato</p>
              <p>{item.conversation.contact?.nome}</p>
              <p className="text-xs text-[var(--muted)]">
                {conversationPhoneLabel(item.conversation.contact?.phoneE164, item.conversation.peerPhoneE164)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Condomínio</p>
              <p>{item.conversation.condominium?.nome}</p>
            </div>
            <div>
              <Label htmlFor="cat">Categoria</Label>
              <Select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="pri">Prioridade</Label>
              <Select id="pri" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((c) => (
                  <option key={c} value={c}>
                    {PRIORITY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="asg">Responsável</Label>
              <Select id="asg" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">Sem responsável</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome || m.email}
                  </option>
                ))}
              </Select>
            </div>
            {patch.isError ? <p className="text-sm text-[var(--danger)]">{(patch.error as Error).message}</p> : null}
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmArchive(true)}>
                Arquivar
              </Button>
              <Button
                type="button"
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
                Promover a chamado
              </Button>
            </div>
          </section>
        </div>
      )}
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
