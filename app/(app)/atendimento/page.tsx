"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Accordion } from "@/components/ui/accordion";
import { MessageBubbles, type MessageBubbleItem } from "@/components/atendimento/message-bubbles";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/ui-labels";
import Link from "next/link";

type Conversation = {
  id: string;
  unidentified: boolean;
  peerPhoneE164?: string;
  unread?: boolean;
  updatedAt: string;
  contact: { nome: string; phoneE164: string } | null;
  condominium: { nome: string } | null;
  connection: { status: string; type: string; label: string };
  triageItem: { id: string; status: string } | null;
  tickets?: { id: string; protocol: string; status: string }[];
  messages: { body: string }[];
};

type Message = MessageBubbleItem;

type Filter = "all" | "unread" | "triage" | "unidentified";

function InboxInner() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState<Filter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread" | "context">("list");
  const [contextOpen, setContextOpen] = useState(true);
  const list = useQuery({
    queryKey: ["conversations", q, filter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (filter === "unread") p.set("unread", "1");
      if (filter === "triage") p.set("untreated", "1");
      if (filter === "unidentified") p.set("unidentified", "1");
      return api<Conversation[]>(`/api/conversations?${p.toString()}`);
    },
  });
  const items = list.data?.data ?? [];
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = selected || current?.id;

  if (list.isError) {
    return <ErrorBanner message="Não foi possível carregar conversas." onRetry={() => list.refetch()} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader title="Atendimento" description="Conversas do escritório" />
      <FilterBar>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Todas
        </FilterChip>
        <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
          Não lidas
        </FilterChip>
        <FilterChip active={filter === "triage"} onClick={() => setFilter("triage")}>
          Triagem
        </FilterChip>
        <FilterChip active={filter === "unidentified"} onClick={() => setFilter("unidentified")}>
          Não identificadas
        </FilterChip>
      </FilterBar>
      <div
        className={cn(
          "mt-4 grid min-h-0 flex-1 gap-0 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]",
          contextOpen ? "xl:grid-cols-[240px_minmax(0,1fr)_260px]" : "xl:grid-cols-[240px_minmax(0,1fr)]",
          "lg:grid-cols-[240px_minmax(0,1fr)]",
        )}
      >
        <aside className={cn("border-r border-[var(--border)] p-3", mobilePane !== "list" && "hidden lg:block")}>
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conversas" />
          {list.isLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Nenhuma conversa" hint="Aguarde um inbound ou use o mock DEV em Conexões." />
          ) : (
            <ul className="mt-3 space-y-0.5">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-[8px] px-3 py-2 text-left text-sm",
                      currentId === c.id ? "bg-[var(--page)]" : "hover:bg-[var(--page)]/70",
                    )}
                    onClick={() => {
                      setSelected(c.id);
                      setMobilePane("thread");
                    }}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {c.unread ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" aria-label="Não lida" /> : null}
                      {c.unidentified ? "Não identificado" : c.contact?.nome || "Contato"}
                    </div>
                    <div className="truncate text-xs text-[var(--muted)]">
                      {c.unidentified ? c.peerPhoneE164 || c.contact?.phoneE164 || "—" : c.messages[0]?.body || "—"}
                    </div>
                    {c.unidentified ? (
                      <div className="truncate text-xs text-[var(--muted)]">{c.messages[0]?.body || "—"}</div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <Thread
          conversation={current}
          hidden={mobilePane !== "thread"}
          onBack={() => setMobilePane("list")}
          onContext={() => setMobilePane("context")}
        />
        <ContextPane
          conversation={current}
          collapsed={!contextOpen}
          onToggle={() => setContextOpen((v) => !v)}
          hidden={mobilePane !== "context"}
          onBack={() => setMobilePane("thread")}
        />
      </div>
    </div>
  );
}

function Thread({
  conversation,
  hidden,
  onBack,
  onContext,
}: {
  conversation?: Conversation;
  hidden: boolean;
  onBack: () => void;
  onContext: () => void;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"publica" | "interna">("publica");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelRecRef = useRef(false);
  const messages = useQuery({
    queryKey: ["messages", conversation?.id],
    enabled: Boolean(conversation?.id),
    queryFn: () => api<Message[]>(`/api/conversations/${conversation!.id}/messages?pageSize=50`),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: { apenasRascunho: boolean; podeResponderCliente: boolean } }>("/api/auth/me"),
  });
  const send = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("body", body);
      form.append("visibility", mode);
      if (file) form.append("file", file);
      if (replyTo) form.append("replyToId", replyTo.id);
      return api(`/api/conversations/${conversation!.id}/messages`, { method: "POST", body: form });
    },
    onSuccess: () => {
      setBody("");
      setFile(null);
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["messages", conversation?.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
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

  const blocked = Boolean(me.data?.data.user.apenasRascunho);
  const disabledPublic =
    !conversation ||
    conversation.connection.status !== "open" ||
    conversation.unidentified ||
    blocked ||
    !me.data?.data.user.podeResponderCliente;

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecordSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function cancelRecord() {
    cancelRecRef.current = true;
    recorderRef.current?.stop();
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    setRecording(false);
    setRecordSecs(0);
  }

  async function toggleRecord() {
    if (recording) {
      cancelRecRef.current = false;
      recorderRef.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!stream) return;
    streamRef.current = stream;
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    cancelRecRef.current = false;
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      stopTracks();
      setRecording(false);
      setRecordSecs(0);
      recorderRef.current = null;
      if (!cancelRecRef.current && blob.size > 0) {
        const ext = mime.includes("ogg") ? "ogg" : "webm";
        setFile(new File([blob], `audio.${ext}`, { type: mime }));
      }
      cancelRecRef.current = false;
    };
    recorderRef.current = recorder;
    setRecordSecs(0);
    setRecording(true);
    recorder.start();
  }

  return (
    <section className={cn("flex min-h-[50vh] flex-col", hidden && "hidden lg:flex")}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button type="button" className="text-sm text-[var(--brand)] lg:hidden" onClick={onBack}>
          ← Conversas
        </button>
        {!conversation ? (
          <p className="text-sm text-[var(--muted)]">Selecione uma conversa</p>
        ) : (
          <div className="min-w-0">
            <p className="font-medium">
              {conversation.unidentified ? "Não identificado" : conversation.contact?.nome}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">
              {conversation.condominium?.nome || "sem condomínio"} · {conversation.connection.label}
              {conversation.connection.type === "dev_mock" ? <Badge className="ml-2" tone="dev">DEV</Badge> : null}
            </p>
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
                onResend={(id) => resend.mutate(id)}
                resendPending={resend.isPending}
              />
            ) : null}
          </div>
          <div className="border-t border-[var(--border)] p-3">
            {blocked ? (
              <p className="mb-2 text-xs text-[var(--warn)]">Seu perfil não pode mandar WhatsApp.</p>
            ) : null}
            {!blocked && mode === "publica" && conversation.unidentified ? (
              <p className="mb-2 text-xs text-[var(--warn)]">Identifique o contato na triagem antes de responder.</p>
            ) : null}
            {!blocked && mode === "publica" && conversation.connection.status !== "open" ? (
              <p className="mb-2 text-xs text-[var(--warn)]">WhatsApp não está conectado.</p>
            ) : null}
            {send.isError ? <ErrorBanner message={(send.error as Error).message} /> : null}
            {resend.isError ? <ErrorBanner message={(resend.error as Error).message} /> : null}
            <div className="mb-2 flex gap-2">
              <Button variant={mode === "publica" ? "primary" : "secondary"} size="sm" type="button" onClick={() => setMode("publica")}>
                Resposta
              </Button>
              <Button variant={mode === "interna" ? "primary" : "secondary"} size="sm" type="button" onClick={() => setMode("interna")}>
                Nota interna
              </Button>
            </div>
            {replyTo ? (
              <div className="mb-2 flex items-center justify-between rounded-[8px] bg-[var(--page)] px-3 py-2 text-xs">
                <span className="truncate">Responder: {replyTo.body}</span>
                <button type="button" className="shrink-0 text-[var(--muted)]" onClick={() => setReplyTo(null)}>
                  ×
                </button>
              </div>
            ) : null}
            {recording ? (
              <p className="mb-2 text-xs text-[var(--warn)]">Gravando áudio {recordSecs}s</p>
            ) : null}
            {file ? <p className="mb-2 truncate text-xs text-[var(--muted)]">{file.name}</p> : null}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!body.trim() && !file) return;
                send.mutate();
              }}
            >
              <Input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={mode === "interna" ? "Nota interna (não vai ao WhatsApp)" : "Digite uma mensagem…"}
                aria-label="Mensagem"
                className="min-w-[12rem] flex-1"
              />
              <input
                type="file"
                className="max-w-[10rem] text-xs"
                aria-label="Anexar arquivo"
                accept="image/jpeg,image/png,application/pdf,audio/ogg,audio/mpeg,audio/mp4,audio/webm"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {mode === "publica" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabledPublic || send.isPending}
                  onClick={() => void toggleRecord()}
                >
                  {recording ? "Parar áudio" : "Áudio"}
                </Button>
              ) : null}
              {recording ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => cancelRecord()}>
                  Cancelar
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={send.isPending || (mode === "publica" && disabledPublic) || (!body.trim() && !file)}
              >
                Enviar
              </Button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}

function ContextPane({
  conversation,
  collapsed,
  onToggle,
  hidden,
  onBack,
}: {
  conversation?: Conversation;
  collapsed: boolean;
  onToggle: () => void;
  hidden: boolean;
  onBack: () => void;
}) {
  return (
    <aside
      className={cn(
        "border-l border-[var(--border)] p-4 text-sm",
        collapsed ? "xl:hidden" : "xl:block",
        hidden ? "hidden" : "block",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="text-[var(--brand)] xl:hidden" onClick={onBack}>
          ← Conversa
        </button>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Contexto</h2>
        <button type="button" className="hidden text-[var(--muted)] xl:inline" onClick={onToggle} aria-label="Recolher contexto">
          −
        </button>
      </div>
      {!conversation ? (
        <p className="text-[var(--muted)]">Selecione uma conversa.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[var(--muted)]">Contato</p>
            <p>{conversation.unidentified ? "Não identificado" : conversation.contact?.nome}</p>
            <p className="text-[var(--muted)]">
              {conversation.contact?.phoneE164 || conversation.peerPhoneE164 || "—"}
            </p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Condomínio</p>
            <p>{conversation.condominium?.nome || "—"}</p>
          </div>
          <Accordion title="Mais informações" defaultOpen>
            <div className="space-y-3">
              <div>
                <p className="text-[var(--muted)]">Triagem</p>
                <p>{conversation.triageItem ? STATUS_LABEL[conversation.triageItem.status] || conversation.triageItem.status : "—"}</p>
                {conversation.triageItem?.status === "aberto" ? (
                  <Link className="text-[var(--brand)]" href={`/triagem/${conversation.triageItem.id}`}>
                    Analisar
                  </Link>
                ) : null}
              </div>
              <div>
                <p className="text-[var(--muted)]">Chamados</p>
                {conversation.tickets?.length ? (
                  conversation.tickets.map((t) => (
                    <Link key={t.id} className="block text-[var(--brand)]" href={`/chamados/${t.id}`}>
                      #{t.protocol}
                    </Link>
                  ))
                ) : (
                  <p>Nenhum</p>
                )}
              </div>
            </div>
          </Accordion>
        </div>
      )}
    </aside>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <InboxInner />
    </Suspense>
  );
}

