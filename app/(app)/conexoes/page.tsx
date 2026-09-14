"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/client/api";

type Connection = {
  id: string;
  type: "evolution_baileys" | "evolution_cloud" | "dev_mock";
  status: string;
  label: string;
  secretStatus: string;
  configured?: boolean;
  liveStatus?: string;
  detail?: string;
};

function qrImgSrc(qr: string): string | null {
  if (qr.startsWith("data:image")) return qr;
  if (qr.startsWith("data:")) return qr;
  // base64 PNG sem prefixo
  if (/^[A-Za-z0-9+/=\s]+$/.test(qr) && qr.length > 100) {
    return `data:image/png;base64,${qr.replace(/\s/g, "")}`;
  }
  return null;
}

export default function ConexoesPage() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<Connection["type"]>("dev_mock");
  const list = useQuery({
    queryKey: ["connections"],
    staleTime: 5000,
    queryFn: () => api<Connection[]>("/api/connections"),
  });
  const create = useMutation({
    mutationFn: () => api("/api/connections", { method: "POST", body: JSON.stringify({ label, type }) }),
    onSuccess: () => {
      setLabel("");
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });
  const mock = useMutation({
    mutationFn: (payload: { fromPhone: string; body: string }) =>
      api("/api/dev/mock-inbound", { method: "POST", body: JSON.stringify(payload) }),
  });
  const [fromPhone, setFromPhone] = useState("+5511999990000");
  const [body, setBody] = useState("Mensagem de teste DEV");

  if (list.isError) {
    const status = (list.error as Error & { status?: number }).status;
    if (status === 403) return <p className="text-[var(--muted)]">Sem permissão.</p>;
    return <ErrorBanner message="Falha ao carregar conexões." onRetry={() => list.refetch()} />;
  }

  const items = list.data?.data ?? [];
  const baileysMissingEnv = items.some((c) => c.type === "evolution_baileys" && c.configured === false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Conexões</h1>
          <p className="text-sm text-[var(--muted)]">
            DevMock é DEV. WhatsApp Web não é o canal Cloud oficial. Secrets nunca são reexibidos. Evolution:
            `docker compose up -d` (Redis + API isolados do banco PORTAL-JURIDICO). Sem Docker, o mock continua.
          </p>
        </div>
      </div>
      {baileysMissingEnv ? (
        <ErrorBanner message="Evolution Baileys sem EVOLUTION_API_URL / EVOLUTION_APIKEY no .env. Preencha as variáveis e reinicie o Next." />
      ) : null}
      {list.isLoading ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhuma conexão" />
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <ConnectionRow key={c.id} c={c} />
          ))}
        </div>
      )}
      <Card>
        <h2 className="font-medium">Nova conexão</h2>
        <form
          className="mt-3 grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <Label htmlFor="label">Nome</Label>
            <Input id="label" required value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="type">Tipo</Label>
            <select
              id="type"
              className="w-full rounded-[12px] border border-[var(--border)] px-3 py-2.5 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as Connection["type"])}
            >
              <option value="dev_mock">Dev / mock</option>
              <option value="evolution_baileys">WhatsApp Web (QR)</option>
              <option value="evolution_cloud">WhatsApp Cloud</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending || !label.trim()}>
              Adicionar
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <h2 className="font-medium">Injetar inbound DEV</h2>
        <p className="text-sm text-[var(--muted)]">Disponível só em development. Não envia para WhatsApp.</p>
        <form
          className="mt-3 grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            mock.mutate({ fromPhone, body });
          }}
        >
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="msg">Mensagem</Label>
            <Input id="msg" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={mock.isPending}>
              Injetar
            </Button>
          </div>
        </form>
        {mock.isSuccess ? <p className="mt-2 text-sm text-[var(--ok)]">Mensagem injetada na inbox/triagem.</p> : null}
        {mock.isError ? <p className="mt-2 text-sm text-[var(--danger)]">{(mock.error as Error).message}</p> : null}
      </Card>
    </div>
  );
}

function ConnectionRow({ c }: { c: Connection }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"qr" | "status" | "disconnect" | null>(null);
  const [liveStatus, setLiveStatus] = useState(c.liveStatus ?? c.status);

  const isBaileys = c.type === "evolution_baileys";
  const configured = c.configured !== false;
  const displayStatus = liveStatus || c.status;
  const imgSrc = qr ? qrImgSrc(qr) : null;

  async function refreshStatus() {
    setBusy("status");
    setActionError("");
    try {
      const res = await api<{
        liveStatus: string;
        status: string;
        detail: string;
        configured: boolean;
      }>(`/api/connections/${c.id}/status`);
      setLiveStatus(res.data.liveStatus || res.data.status);
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function loadQr() {
    setBusy("qr");
    setActionError("");
    setQr(null);
    setPairingCode(null);
    try {
      const res = await api<{ qr: string | null; pairingCode: string | null; status: string }>(
        `/api/connections/${c.id}/qr`,
      );
      setQr(res.data.qr);
      setPairingCode(res.data.pairingCode);
      setLiveStatus(res.data.status || "connecting");
      if (res.data.status === "open") {
        setActionError("Sessão já conectada. Use Desconectar se quiser um QR novo.");
      } else if (!res.data.qr && !res.data.pairingCode) {
        setActionError("QR indisponível (instância ou Evolution).");
      }
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setActionError("");
    try {
      const res = await api<{ liveStatus: string; status: string }>(`/api/connections/${c.id}/disconnect`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setLiveStatus(res.data.liveStatus || res.data.status || "close");
      setQr(null);
      setPairingCode(null);
      qc.invalidateQueries({ queryKey: ["connections"] });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">
            {c.label}{" "}
            {c.type === "dev_mock" ? <Badge tone="dev">DEV</Badge> : <Badge tone="wa">WhatsApp</Badge>}{" "}
            {isBaileys ? (
              configured ? (
                <Badge tone="ok">configurada</Badge>
              ) : (
                <Badge tone="danger">env ausente</Badge>
              )
            ) : null}
          </p>
          <p className="text-sm text-[var(--muted)]">
            {c.type === "evolution_baileys"
              ? "WhatsApp Web (não oficial)"
              : c.type === "evolution_cloud"
                ? "oficial — não configurado"
                : "somente desenvolvimento"}
            {" · secret "}
            {c.secretStatus}
            {c.detail ? ` · ${c.detail}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={c.status === "open" ? "ok" : c.status === "connecting" ? "warn" : "muted"}>
            db:{c.status}
          </Badge>
          <Badge
            tone={
              displayStatus === "open"
                ? "ok"
                : displayStatus === "connecting"
                  ? "warn"
                  : "muted"
            }
          >
            live:{displayStatus}
          </Badge>
          {isBaileys ? (
            <>
              <Button variant="secondary" type="button" disabled={busy !== null} onClick={refreshStatus}>
                {busy === "status" ? "Status…" : "Atualizar status"}
              </Button>
              <Button variant="secondary" type="button" disabled={busy !== null || !configured} onClick={loadQr}>
                {busy === "qr" ? "QR…" : "Obter QR"}
              </Button>
              <Button variant="secondary" type="button" disabled={busy !== null || !configured} onClick={disconnect}>
                {busy === "disconnect" ? "Desconectando…" : "Desconectar"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {actionError ? <p className="text-sm text-[var(--danger)]">{actionError}</p> : null}
      {pairingCode ? (
        <p className="text-sm">
          Código de pareamento: <span className="font-mono font-medium">{pairingCode}</span>
        </p>
      ) : null}
      {imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgSrc} alt="QR Code WhatsApp Web" className="h-48 w-48 rounded-[12px] border border-[var(--border)] bg-white p-2" />
      ) : qr ? (
        <p className="break-all text-xs text-[var(--muted)]">{qr.slice(0, 120)}…</p>
      ) : null}
    </Card>
  );
}
