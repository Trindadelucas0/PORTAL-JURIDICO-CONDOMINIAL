"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Card, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Ticket = {
  id: string;
  protocol: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  conversationId: string | null;
  assignedTo: { id: string; email: string };
  condominium: { id: string; nome: string };
  contact: { nome: string; phoneE164: string };
  conversation: { connection: { status: string; label: string; type: string } } | null;
  documents: Array<{ id: string; originalName: string; sizeBytes: number; ingestStatus: string; storageKey: string }>;
  deadlines: Array<{ id: string; title: string; dueAt: string; doneAt: string | null; kind: string }>;
  messages: Array<{ id: string; body: string; sendStatus: string }>;
};

type Msg = {
  id: string;
  body: string;
  direction: string;
  visibility: string;
  sendStatus: string;
  createdAt: string;
};

export default function ChamadoFichaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
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
  });

  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"publica" | "interna">("publica");
  const [status, setStatus] = useState("");
  const [deadlineTitle, setDeadlineTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  const send = useMutation({
    mutationFn: () =>
      api(`/api/tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, visibility: mode }),
      }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
    },
  });
  const approve = useMutation({
    mutationFn: (messageId: string) => api(`/api/messages/${messageId}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", id] });
      qc.invalidateQueries({ queryKey: ["ticket-messages", id] });
    },
  });
  const patch = useMutation({
    mutationFn: () => api(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket", id] }),
  });
  const addDeadline = useMutation({
    mutationFn: () =>
      api("/api/deadlines", {
        method: "POST",
        body: JSON.stringify({
          ticketId: id,
          title: deadlineTitle,
          dueAt: new Date(dueAt).toISOString(),
          kind: "atendimento",
        }),
      }),
    onSuccess: () => {
      setDeadlineTitle("");
      setDueAt("");
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("ticketId", id);
      return api("/api/documents", { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket", id] }),
  });

  if (ticket.isError) {
    const statusCode = (ticket.error as Error & { status?: number }).status;
    if (statusCode === 403) {
      return (
        <div>
          <h1 className="font-display text-3xl">Chamado</h1>
          <p className="mt-4 text-[var(--muted)]">Sem permissão para este chamado.</p>
        </div>
      );
    }
    if (statusCode === 404) {
      return (
        <div>
          <h1 className="font-display text-3xl">Chamado</h1>
          <p className="mt-4 text-[var(--muted)]">Chamado não encontrado.</p>
        </div>
      );
    }
    return <ErrorBanner message="Falha ao carregar chamado." onRetry={() => ticket.refetch()} />;
  }

  const t = ticket.data?.data;
  const admin = me.data?.data.user.role === "admin";
  const draftOnly = Boolean(me.data?.data.user.apenasRascunho);
  const connOpen = t?.conversation?.connection.status === "open";

  return (
    <div className="space-y-4">
      <Link href="/chamados" className="text-sm text-[var(--brand)]">
        ← Chamados
      </Link>
      {ticket.isLoading || !t ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div>
              <h1 className="font-display text-3xl">#{t.protocol}</h1>
              <p className="text-[var(--muted)]">{t.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{t.status}</Badge>
                <Badge tone="warn">{t.priority}</Badge>
                <Badge tone="muted">{t.category}</Badge>
              </div>
            </div>
            <Card className="flex flex-col gap-3">
              <h2 className="font-medium">Andamento</h2>
              {messages.isLoading ? <Skeleton className="h-24" /> : null}
              {(messages.data?.data ?? []).length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Sem mensagens nesta ficha.</p>
              ) : (
                <ul className="space-y-2">
                  {(messages.data?.data ?? []).map((m) => (
                    <li
                      key={m.id}
                      className={
                        m.visibility === "interna"
                          ? "rounded-[12px] bg-amber-50 px-3 py-2 text-sm"
                          : "rounded-[12px] bg-[var(--page)] px-3 py-2 text-sm"
                      }
                    >
                      {m.visibility === "interna" ? <span className="mr-1 text-[10px] uppercase">nota</span> : null}
                      {m.body}
                      {m.sendStatus === "draft" && m.visibility === "publica" ? (
                        <Badge tone="warn">rascunho</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button variant={mode === "publica" ? "primary" : "secondary"} type="button" onClick={() => setMode("publica")}>
                  {draftOnly ? "Rascunho WA" : "Resposta"}
                </Button>
                <Button variant={mode === "interna" ? "primary" : "secondary"} type="button" onClick={() => setMode("interna")}>
                  Nota interna
                </Button>
              </div>
              {mode === "publica" && !connOpen ? (
                <p className="text-xs text-[var(--muted)]">Conexão não está aberta — envio público indisponível.</p>
              ) : null}
              {send.isError ? <ErrorBanner message={(send.error as Error).message} /> : null}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!body.trim()) return;
                  send.mutate();
                }}
              >
                <Input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={mode === "interna" ? "Nota interna (nunca vai ao WhatsApp)" : "Mensagem"}
                  aria-label="Mensagem do chamado"
                />
                <Button
                  type="submit"
                  disabled={
                    send.isPending ||
                    !body.trim() ||
                    (mode === "publica" && !draftOnly && !connOpen)
                  }
                >
                  {draftOnly && mode === "publica" ? "Salvar rascunho" : "Enviar"}
                </Button>
              </form>
              {admin && t.messages.length > 0 ? (
                <div className="space-y-2 border-t border-[var(--border)] pt-3">
                  <p className="text-sm font-medium">Aprovar rascunhos</p>
                  {t.messages.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{m.body}</span>
                      <Button
                        type="button"
                        disabled={approve.isPending || !connOpen}
                        onClick={() => approve.mutate(m.id)}
                      >
                        Aprovar
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <h2 className="font-medium">Condomínio / contato</h2>
              <p className="mt-2 text-sm">{t.condominium.nome}</p>
              <p className="text-sm text-[var(--muted)]">
                {t.contact.nome} · {t.contact.phoneE164}
              </p>
              <p className="mt-2 text-sm">Responsável: {t.assignedTo.email}</p>
              {t.conversation ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {t.conversation.connection.label} · {t.conversation.connection.status}
                  {t.conversation.connection.type === "evolution_baileys" ? " · WhatsApp Web (não oficial)" : ""}
                </p>
              ) : null}
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (status) patch.mutate();
                }}
              >
                <Label htmlFor="st" className="sr-only">
                  Status
                </Label>
                <select
                  id="st"
                  className="w-full rounded-[12px] border border-[var(--border)] px-2 py-2 text-sm"
                  value={status || t.status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="aberto">aberto</option>
                  <option value="em_andamento">em_andamento</option>
                  <option value="aguardando">aguardando</option>
                  <option value="resolvido">resolvido</option>
                </select>
                <Button type="submit" variant="secondary" disabled={patch.isPending}>
                  Salvar
                </Button>
              </form>
            </Card>
            <Card>
              <h2 className="font-medium">Documentos</h2>
              {t.documents.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Nenhum arquivo.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {t.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <span>
                        {d.originalName} · {Math.round(d.sizeBytes / 1024)} kb · {d.ingestStatus}
                      </span>
                      <a className="text-[var(--brand)]" href={`/api/files/${d.storageKey}`}>
                        Baixar
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <Label htmlFor="up" className="mt-3">
                Upload (jpeg/png/pdf/áudio)
              </Label>
              <input
                id="up"
                type="file"
                className="mt-1 w-full text-sm"
                accept="image/jpeg,image/png,application/pdf,audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                }}
              />
            </Card>
            <Card>
              <h2 className="font-medium">Prazos da ficha</h2>
              {t.deadlines.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Nenhum prazo.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {t.deadlines.map((d) => (
                    <li key={d.id}>
                      {d.title} · {new Date(d.dueAt).toLocaleString("pt-BR")}
                      {d.doneAt ? " · concluído" : ""}
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addDeadline.mutate();
                }}
              >
                <Input
                  placeholder="Título do prazo"
                  value={deadlineTitle}
                  onChange={(e) => setDeadlineTitle(e.target.value)}
                  aria-label="Título do prazo"
                />
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  aria-label="Vencimento"
                />
                <Button type="submit" variant="secondary" disabled={!deadlineTitle || !dueAt || addDeadline.isPending}>
                  Adicionar prazo
                </Button>
              </form>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
