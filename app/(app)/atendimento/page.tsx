"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  unidentified: boolean;
  updatedAt: string;
  contact: { nome: string; phoneE164: string } | null;
  condominium: { nome: string } | null;
  connection: { status: string; type: string; label: string };
  triageItem: { id: string; status: string } | null;
  tickets?: { id: string; protocol: string }[];
  messages: { body: string }[];
};

type Message = {
  id: string;
  body: string;
  direction: "in" | "out";
  visibility: "publica" | "interna";
  sendStatus: string;
  createdAt: string;
};

export default function InboxPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const list = useQuery({
    queryKey: ["conversations", q],
    queryFn: () => api<Conversation[]>(`/api/conversations?q=${encodeURIComponent(q)}`),
  });
  const items = list.data?.data ?? [];
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = selected || current?.id;

  if (list.isError) {
    return <ErrorBanner message="Não foi possível carregar conversas." onRetry={() => list.refetch()} />;
  }

  return (
    <div className="space-y-3">
      <h1 className="font-display text-3xl">Inbox</h1>
      <div className="grid min-h-[70vh] gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <Card className={cn("p-3", mobilePane === "thread" && "hidden lg:block")}>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conversas" />
          {list.isLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : items.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Nenhuma conversa" hint="Use o mock DEV em Conexões ou aguarde um inbound." />
            </div>
          ) : (
            <ul className="mt-3 space-y-1">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-[12px] px-3 py-2 text-left text-sm",
                      currentId === c.id ? "bg-[var(--brand)] text-white" : "hover:bg-[var(--page)]",
                    )}
                    onClick={() => {
                      setSelected(c.id);
                      setMobilePane("thread");
                    }}
                  >
                    <div className="font-medium">
                      {c.unidentified ? "não identificado" : c.contact?.nome || "Contato"}
                    </div>
                    <div className={cn("truncate text-xs", currentId === c.id ? "text-white/80" : "text-[var(--muted)]")}>
                      {c.messages[0]?.body || "—"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Thread
          conversation={current}
          hidden={mobilePane === "list"}
          onBack={() => setMobilePane("list")}
        />
        <ContextPane conversation={current} />
      </div>
    </div>
  );
}

function Thread({
  conversation,
  hidden,
  onBack,
}: {
  conversation?: Conversation;
  hidden: boolean;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"publica" | "interna">("publica");
  const messages = useQuery({
    queryKey: ["messages", conversation?.id],
    enabled: Boolean(conversation?.id),
    queryFn: () => api<Message[]>(`/api/conversations/${conversation!.id}/messages?pageSize=50`),
  });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: { apenasRascunho: boolean; podeResponderCliente: boolean } }>("/api/auth/me") });
  const send = useMutation({
    mutationFn: () =>
      api(`/api/conversations/${conversation!.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, visibility: mode }),
      }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["messages", conversation?.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const draftOnly = Boolean(me.data?.data.user.apenasRascunho);
  const disabledPublic =
    !conversation ||
    conversation.connection.status !== "open" ||
    conversation.unidentified ||
    (!draftOnly && !me.data?.data.user.podeResponderCliente);

  return (
    <Card className={cn("flex flex-col p-3", hidden && "hidden lg:flex")}>
      <button type="button" className="mb-2 text-left text-sm text-[var(--brand)] lg:hidden" onClick={onBack}>
        ← Conversas
      </button>
      {!conversation ? (
        <EmptyState title="Selecione uma conversa" />
      ) : (
        <>
          <div className="border-b border-[var(--border)] pb-2">
            <div className="font-medium">
              {conversation.unidentified ? "não identificado" : conversation.contact?.nome}
            </div>
            <div className="text-xs text-[var(--muted)]">
              {conversation.condominium?.nome || "sem condomínio"} · via {conversation.connection.label} · sessão:{" "}
              {conversation.connection.status}
              {conversation.connection.type === "dev_mock" ? (
                <span className="ml-1">
                  <Badge tone="dev">Dev / mock</Badge>
                </span>
              ) : conversation.connection.type === "evolution_baileys" ? (
                <span className="ml-1">
                  <Badge tone="wa">WhatsApp Web</Badge>
                </span>
              ) : (
                <span className="ml-1">
                  <Badge tone="wa">WhatsApp</Badge>
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto py-3">
            {messages.isLoading ? <Skeleton className="h-20" /> : null}
            {(messages.data?.data ?? []).map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[80%] rounded-[14px] px-3 py-2 text-sm",
                  m.visibility === "interna"
                    ? "bg-amber-50 text-[var(--warn)]"
                    : m.direction === "out"
                      ? "ml-auto bg-[var(--brand)] text-white"
                      : "bg-[var(--page)]",
                )}
              >
                {m.visibility === "interna" ? <span className="mr-1 text-[10px] uppercase">nota</span> : null}
                {m.body}
              </div>
            ))}
          </div>
          {draftOnly ? (
            <p className="mb-2 text-xs text-[var(--warn)]">
              Seu perfil só grava rascunho. Admin aprova na ficha do chamado para enviar no WhatsApp.
            </p>
          ) : null}
          {!draftOnly && mode === "publica" && conversation.unidentified ? (
            <p className="mb-2 text-xs text-[var(--warn)]">Identifique o contato na triagem antes de responder no WhatsApp.</p>
          ) : null}
          {!draftOnly &&
          mode === "publica" &&
          !conversation.unidentified &&
          conversation.connection.type === "evolution_baileys" &&
          conversation.connection.status !== "open" ? (
            <p className="mb-2 text-xs text-[var(--warn)]">
              WhatsApp Web não está conectado. Abra Conexões, atualize o status e escaneie o QR se precisar.
            </p>
          ) : null}
          {!draftOnly &&
          mode === "publica" &&
          !conversation.unidentified &&
          conversation.connection.type !== "evolution_baileys" &&
          conversation.connection.status !== "open" ? (
            <p className="mb-2 text-xs text-[var(--warn)]">Conexão não está aberta para envio.</p>
          ) : null}
          {send.isError ? <ErrorBanner message={(send.error as Error).message} /> : null}
          <div className="flex gap-2">
            <Button variant={mode === "publica" ? "primary" : "secondary"} type="button" onClick={() => setMode("publica")}>
              Resposta
            </Button>
            <Button variant={mode === "interna" ? "primary" : "secondary"} type="button" onClick={() => setMode("interna")}>
              Nota interna
            </Button>
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!body.trim()) return;
              send.mutate();
            }}
          >
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={mode === "interna" ? "Nota interna (não vai ao WhatsApp)" : "Mensagem"}
              aria-label="Mensagem"
            />
            <Button
              type="submit"
              disabled={send.isPending || (mode === "publica" && !draftOnly && disabledPublic) || !body.trim()}
            >
              {draftOnly && mode === "publica" ? "Salvar rascunho" : "Enviar"}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

function ContextPane({ conversation }: { conversation?: Conversation }) {
  return (
    <Card className="hidden lg:block">
      <h2 className="font-medium">Contexto</h2>
      {!conversation ? (
        <p className="mt-2 text-sm text-[var(--muted)]">Selecione uma conversa.</p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Condomínio</dt>
            <dd>{conversation.condominium?.nome || "não identificado"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Contato</dt>
            <dd>
              {conversation.contact?.nome || "não identificado"}
              {conversation.contact?.phoneE164 ? ` · ${conversation.contact.phoneE164}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Triagem</dt>
            <dd>{conversation.triageItem?.status || "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Chamados</dt>
            <dd>
              {conversation.tickets?.length
                ? conversation.tickets.map((t) => `#${t.protocol}`).join(", ")
                : "nenhum — inbound não cria chamado"}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
