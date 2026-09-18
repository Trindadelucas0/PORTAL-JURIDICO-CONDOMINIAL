"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageBubbles, type MessageBubbleItem } from "@/components/atendimento/message-bubbles";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

export type ThreadConversation = {
  id: string;
  unidentified: boolean;
  peerPhoneE164?: string;
  contact: { nome: string; phoneE164: string } | null;
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

  const blocked = Boolean(me.data?.data.user.apenasRascunho);
  const disabledPublic = !conversation || !allowPublicSend || blocked || !me.data?.data.user.podeResponderCliente;

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
            <p className="font-medium">{title}</p>
            <p className="truncate text-xs text-[var(--muted)]">
              {subtitle}
              {conversation.connection.type === "dev_mock" ? (
                <Badge className="ml-2" tone="dev">
                  DEV
                </Badge>
              ) : null}
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
            {!blocked && mode === "publica" && publicBlockedHint ? (
              <p className="mb-2 text-xs text-[var(--warn)]">{publicBlockedHint}</p>
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
