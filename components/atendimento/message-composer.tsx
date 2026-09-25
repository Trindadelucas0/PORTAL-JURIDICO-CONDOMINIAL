"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

export type ComposerUser = {
  apenasRascunho: boolean;
  podeResponderCliente: boolean;
  role?: string;
};

export function MessageComposer({
  user,
  allowPublicSend,
  publicBlockedHint,
  pending,
  error,
  onSend,
}: {
  user?: ComposerUser;
  allowPublicSend: boolean;
  publicBlockedHint?: string | null;
  pending?: boolean;
  error?: string | null;
  onSend: (input: { body: string; visibility: "publica" | "interna"; file: File | null; replyToId?: string }) => void;
}) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"publica" | "interna">("publica");
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelRecRef = useRef(false);

  const admin = user?.role === "admin";
  const draftOnly = Boolean(user?.apenasRascunho) && Boolean(user?.podeResponderCliente) && !admin;
  const canSendNow = admin || (Boolean(user?.podeResponderCliente) && !user?.apenasRascunho);
  const publicDisabled = !allowPublicSend || (!canSendNow && !draftOnly) || !user?.podeResponderCliente;

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

  function submit() {
    if (!body.trim() && !file) return;
    onSend({ body, visibility: mode, file });
    setBody("");
    setFile(null);
  }

  return (
    <div className="shrink-0 border-t border-border p-3">
      {draftOnly && mode === "publica" ? (
        <p className="mb-2 text-xs text-[var(--warn)]">
          Seu perfil grava rascunho. O administrador aprova e envia no WhatsApp.
        </p>
      ) : null}
      {!draftOnly && !canSendNow && mode === "publica" ? (
        <p className="mb-2 text-xs text-[var(--warn)]">Seu perfil não pode mandar WhatsApp.</p>
      ) : null}
      {!publicDisabled && mode === "publica" && publicBlockedHint ? (
        <p className="mb-2 text-xs text-[var(--warn)]">{publicBlockedHint}</p>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      <div className="mb-2 flex gap-2">
        <Button variant={mode === "publica" ? "primary" : "secondary"} size="sm" type="button" onClick={() => setMode("publica")}>
          Resposta
        </Button>
        <Button variant={mode === "interna" ? "primary" : "secondary"} size="sm" type="button" onClick={() => setMode("interna")}>
          Nota interna
        </Button>
      </div>
      {recording ? <p className="mb-2 text-xs text-[var(--warn)]">Gravando áudio {recordSecs}s</p> : null}
      {file ? <p className="mb-2 truncate text-xs text-muted-foreground">{file.name}</p> : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
          ref={fileInputRef}
          type="file"
          className="sr-only"
          aria-label="Anexar arquivo"
          accept="image/jpeg,image/png,application/pdf,audio/ogg,audio/mpeg,audio/mp4,audio/webm"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          Anexar
        </Button>
        {mode === "publica" ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={publicDisabled || pending}
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
        {mode === "interna" ? (
          <Button type="submit" disabled={pending || (!body.trim() && !file)}>
            Salvar nota
          </Button>
        ) : draftOnly ? (
          <>
            <Button type="submit" variant="secondary" disabled={pending || publicDisabled || (!body.trim() && !file)}>
              Salvar rascunho
            </Button>
            <Button type="submit" disabled={pending || publicDisabled || (!body.trim() && !file)}>
              Enviar para aprovação
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={pending || publicDisabled || (!body.trim() && !file)} className={cn()}>
            Enviar
          </Button>
        )}
      </form>
    </div>
  );
}
