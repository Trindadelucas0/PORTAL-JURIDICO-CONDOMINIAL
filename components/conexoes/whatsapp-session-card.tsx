"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client/api";

export type Connection = {
  id: string;
  type: "evolution_baileys" | "evolution_cloud" | "dev_mock";
  status: string;
  label: string;
  secretStatus: string;
  configured?: boolean;
  liveStatus?: string;
  detail?: string;
};

export function qrImgSrc(qr: string): string | null {
  if (qr.startsWith("data:image")) return qr;
  if (qr.startsWith("data:")) return qr;
  if (/^[A-Za-z0-9+/=\s]+$/.test(qr) && qr.length > 100) {
    return `data:image/png;base64,${qr.replace(/\s/g, "")}`;
  }
  return null;
}

function normalizeLive(live: string): string {
  return live.toLowerCase();
}

export function humanSessionStatus(live: string): { label: string; tone: "ok" | "warn" | "muted" } {
  const s = normalizeLive(live);
  if (s === "open" || s === "connected") return { label: "Conectado", tone: "ok" };
  if (s === "connecting" || s === "qr" || s === "qrcode") return { label: "Aguardando QR", tone: "warn" };
  return { label: "Desconectado", tone: "muted" };
}

function isOpen(live: string): boolean {
  const s = normalizeLive(live);
  return s === "open" || s === "connected";
}

export function pickPrimaryBaileys(items: Connection[]): Connection | null {
  const baileys = items.filter((c) => c.type === "evolution_baileys");
  if (baileys.length === 0) return null;
  return baileys.find((c) => /escrit[oó]rio/i.test(c.label)) ?? baileys[0];
}

const STATUS_POLL_MS = 3_000;
const QR_REFRESH_MS = 15_000;
const PAIRING_TIMEOUT_MS = 60_000;

export function WhatsappSessionCard({ c, compact = false }: { c: Connection; compact?: boolean }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"qr" | "disconnect" | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [polledStatus, setPolledStatus] = useState<string | null>(null);
  const pairingStartedAt = useRef<number>(Date.now());
  const loadQrInFlight = useRef(false);

  const configured = c.configured !== false;
  const displayStatus = polledStatus ?? c.liveStatus ?? c.status;
  const human = humanSessionStatus(displayStatus);
  const connected = isOpen(displayStatus);
  const imgSrc = qr ? qrImgSrc(qr) : null;
  const showPanel = panelOpen && !connected;

  // Status poll while pairing — 60s timer resets when QR image changes (pollKey / qr).
  useEffect(() => {
    if (!panelOpen || connected || (!qr && !pairingCode)) return;
    let cancelled = false;
    pairingStartedAt.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - pairingStartedAt.current > PAIRING_TIMEOUT_MS) {
        setActionError("Ainda não conectou. O QR pode ter expirado — toque em Atualizar QR.");
        return;
      }
      try {
        const res = await api<{ liveStatus: string; status: string }>(`/api/connections/${c.id}/status`);
        if (cancelled) return;
        const next = res.data.liveStatus || res.data.status;
        setPolledStatus(next);
        if (isOpen(next)) {
          setPanelOpen(false);
          setQr(null);
          setPairingCode(null);
          qc.invalidateQueries({ queryKey: ["connections"] });
          return;
        }
      } catch {
        /* keep polling */
      }
      timer = setTimeout(tick, STATUS_POLL_MS);
    };

    timer = setTimeout(tick, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [panelOpen, connected, pollKey, qr, pairingCode, c.id, qc]);

  // Refresh QR image every ~15s so WhatsApp never sees a dead code.
  useEffect(() => {
    if (!panelOpen || connected || !qr) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled || loadQrInFlight.current) return;
      void loadQr({ fresh: true, silent: true });
    }, QR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // loadQr is stable enough via closure; depend on panel/qr/connected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, connected, qr, c.id]);

  async function loadQr(opts?: { fresh?: boolean; silent?: boolean }) {
    if (loadQrInFlight.current) return;
    loadQrInFlight.current = true;
    const fresh = opts?.fresh === true;
    const silent = opts?.silent === true;
    if (!silent) {
      setBusy("qr");
      setActionError("");
      // Only clear image on explicit first load / manual refresh — not on silent poll (avoid flash).
      if (!fresh || !qr) {
        setQr(null);
        setPairingCode(null);
      }
    }
    try {
      const qs = fresh ? "?fresh=1" : "";
      const res = await api<{ qr: string | null; pairingCode: string | null; status: string }>(
        `/api/connections/${c.id}/qr${qs}`,
      );
      const nextQr = res.data.qr;
      const nextPair = res.data.pairingCode;
      // Keep previous image if fresh poll returned empty (Evolution mid-rotate).
      if (nextQr) {
        const changed = nextQr !== qr;
        setQr(nextQr);
        if (changed) {
          pairingStartedAt.current = Date.now();
          setPollKey((k) => k + 1);
          setActionError("");
        }
      } else if (!silent && !fresh) {
        setQr(null);
      }
      if (nextPair) setPairingCode(nextPair);
      else if (!silent && !fresh) setPairingCode(null);

      setPolledStatus(res.data.status || "connecting");
      if (isOpen(res.data.status || "")) {
        setPanelOpen(false);
        setQr(null);
        setPairingCode(null);
        setActionError("Já está conectado.");
      } else if (!silent && !nextQr && !nextPair && !qr) {
        setActionError("Não deu para gerar o QR. Tente de novo.");
      }
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (e) {
      if (!silent) setActionError((e as Error).message);
    } finally {
      loadQrInFlight.current = false;
      if (!silent) setBusy(null);
    }
  }

  async function connect() {
    setPanelOpen(true);
    pairingStartedAt.current = Date.now();
    setPollKey((k) => k + 1);
    await loadQr();
  }

  async function disconnect() {
    setBusy("disconnect");
    setActionError("");
    try {
      const res = await api<{ liveStatus: string; status: string }>(`/api/connections/${c.id}/disconnect`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPolledStatus(res.data.liveStatus || res.data.status || "close");
      setQr(null);
      setPairingCode(null);
      setPanelOpen(false);
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const [confirmDisc, setConfirmDisc] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 shadow-none">
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-medium">{compact ? c.label : "WhatsApp do escritório"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Canal utilizado para atendimento aos condomínios</p>
        </div>
        <p
          className={
            human.tone === "ok"
              ? "inline-flex items-center gap-2 text-sm text-[var(--status-resolvido)]"
              : human.tone === "warn"
                ? "inline-flex items-center gap-2 text-sm text-[var(--status-andamento)]"
                : "inline-flex items-center gap-2 text-sm text-muted-foreground"
          }
          aria-live="polite"
        >
          <span
            className={
              human.tone === "ok"
                ? "h-2 w-2 rounded-full bg-[var(--ok)]"
                : human.tone === "warn"
                  ? "h-2 w-2 rounded-full bg-[var(--warn)]"
                  : "h-2 w-2 rounded-full bg-muted-foreground"
            }
            aria-hidden
          />
          <span className="font-semibold tracking-wide uppercase">{human.label === "Conectado" ? "CONECTADO" : human.label}</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {connected ? (
            <Button variant="secondary" type="button" disabled={busy !== null || !configured} onClick={() => setConfirmDisc(true)}>
              {busy === "disconnect" ? "Desconectando…" : "Desconectar"}
            </Button>
          ) : (
            <Button type="button" disabled={busy !== null || !configured} onClick={connect}>
              {busy === "qr" ? "Gerando QR…" : "Conectar WhatsApp"}
            </Button>
          )}
        </div>
        {!configured ? (
          <p className="text-sm text-[var(--danger)]">Serviço indisponível. Preencha o .env da Evolution e reinicie o Next.</p>
        ) : null}
        {actionError && !showPanel ? <p className="text-sm text-[var(--danger)]">{actionError}</p> : null}
      </div>
      <Dialog
        open={showPanel}
        onClose={() => {
          setPanelOpen(false);
          setQr(null);
        }}
        title="Conectar WhatsApp"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm">Escaneie o QR Code</p>
          {busy === "qr" && !imgSrc ? (
            <p className="text-sm text-[var(--muted)]">Gerando QR…</p>
          ) : imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt="QR Code para conectar o WhatsApp Web do escritório"
              className="h-52 w-52 rounded-[12px] border border-[var(--border)] bg-white p-2"
            />
          ) : qr ? (
            <p className="break-all text-xs text-[var(--muted)]">{qr.slice(0, 120)}…</p>
          ) : actionError ? (
            <p className="text-sm text-[var(--danger)]">{actionError}</p>
          ) : (
            <p className="text-sm text-[var(--muted)]">Aguardando conexão…</p>
          )}
          {pairingCode ? (
            <p className="text-sm">
              Código: <span className="font-mono font-medium">{pairingCode}</span>
            </p>
          ) : null}
          {imgSrc || pairingCode ? (
            <p className="text-xs text-[var(--muted)]">
              O código atualiza sozinho a cada ~20s. Se o WhatsApp recusar, espere mudar ou toque em Atualizar QR.
            </p>
          ) : null}
          {actionError && imgSrc ? <p className="text-sm text-[var(--danger)]">{actionError}</p> : null}
          <p className="text-xs text-[var(--muted)]">WhatsApp → Aparelhos conectados → Escanear.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {imgSrc || pairingCode || actionError ? (
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => void loadQr({ fresh: true })}
              >
                {busy === "qr" ? "Gerando QR…" : imgSrc || pairingCode ? "Atualizar QR" : "Tentar de novo"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPanelOpen(false);
                setQr(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDisc}
        onClose={() => setConfirmDisc(false)}
        title="Desconectar WhatsApp"
        message="O escritório deixará de enviar e receber mensagens por este canal até conectar de novo."
        confirmLabel="Desconectar"
        danger
        onConfirm={() => disconnect()}
      />
    </div>
  );
}
