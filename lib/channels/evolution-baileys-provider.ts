import { AppError, unavailable, unprocessable } from "@/lib/api/errors";
import { rememberEvolutionQr, readEvolutionQr, clearEvolutionQr } from "@/lib/channels/evolution-qr-cache";
import {
  EVOLUTION_UNREACHABLE_MESSAGE,
  evolutionLogoutAlreadyOff,
  evolutionSendDestinations,
  evolutionSendLooksLikeLegacySchema,
  isEvolutionUnreachable,
  pickRicherEvolutionError,
} from "@/lib/channels/evolution-send";
import type {
  GetQrOptions,
  ProviderSendInput,
  ProviderSendMediaInput,
  ProviderStatusResult,
  QrResult,
  WhatsAppProvider,
} from "@/lib/channels/whatsapp-provider";

function evoBase() {
  return process.env.EVOLUTION_API_URL?.replace(/\/$/, "") || "";
}

function evoKey() {
  return process.env.EVOLUTION_APIKEY || "";
}

function instance() {
  return process.env.EVOLUTION_INSTANCE || "juricon";
}

function webhookUrl() {
  return process.env.EVOLUTION_WEBHOOK_URL?.replace(/\/$/, "") || "";
}

function webhookSecret() {
  return process.env.EVOLUTION_WEBHOOK_SECRET || "";
}

function quotedPayload(quotedWaMessageId?: string): { quoted?: { key: { id: string } } } {
  if (!quotedWaMessageId) return {};
  return { quoted: { key: { id: quotedWaMessageId } } };
}

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "QRCODE_UPDATED"] as const;

function webhookConfigBody() {
  return {
    enabled: true,
    url: webhookUrl(),
    webhookByEvents: false,
    webhookBase64: false,
    headers: {
      "x-evolution-secret": webhookSecret(),
    },
    events: [...WEBHOOK_EVENTS],
  };
}

function headers(json = false): HeadersInit {
  return {
    apikey: evoKey(),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function evoFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (isEvolutionUnreachable(error)) {
      throw unavailable(EVOLUTION_UNREACHABLE_MESSAGE);
    }
    throw error;
  }
}

function parseQrPayload(json: {
  code?: string;
  pairingCode?: string;
  base64?: string;
  qrcode?: { base64?: string; code?: string; pairingCode?: string; count?: number };
  count?: number;
}): { qr: string | null; pairingCode: string | null } {
  const nested = json.qrcode;
  const rawQr = json.base64 || nested?.base64 || null;
  const rawCode = json.code || nested?.code || null;
  const qr =
    (typeof rawQr === "string" && rawQr.length > 40 ? rawQr : null) ||
    (typeof rawCode === "string" && rawCode.length > 40 ? rawCode : null);
  const pairingCode = json.pairingCode || nested?.pairingCode || null;
  const parsed = { qr, pairingCode };
  rememberEvolutionQr(parsed);
  return parsed;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForQr(ms: number): Promise<{ qr: string | null; pairingCode: string | null } | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const cached = readEvolutionQr();
    if (cached?.qr || cached?.pairingCode) {
      return { qr: cached.qr, pairingCode: cached.pairingCode };
    }
    await sleep(500);
  }
  const cached = readEvolutionQr();
  if (cached?.qr || cached?.pairingCode) {
    return { qr: cached.qr, pairingCode: cached.pairingCode };
  }
  return null;
}

function hasQrPayload(parsed: { qr: string | null; pairingCode: string | null }) {
  return Boolean(parsed.qr || parsed.pairingCode);
}

async function instanceExists(): Promise<boolean> {
  const name = instance();
  const res = await evoFetch(`${evoBase()}/instance/connectionState/${encodeURIComponent(name)}`, {
    headers: headers(),
  });
  if (res.ok) return true;
  if (res.status === 404) return false;
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; status?: number };
  const msg = `${body.error || ""} ${body.message || ""}`.toLowerCase();
  if (res.status === 400 || msg.includes("not found") || msg.includes("does not exist")) {
    return false;
  }
  return false;
}

async function createInstance(): Promise<{ qr: string | null; pairingCode: string | null }> {
  const res = await evoFetch(`${evoBase()}/instance/create`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      instanceName: instance(),
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: webhookSecret() && webhookUrl() ? webhookConfigBody() : undefined,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    code?: string;
    pairingCode?: string;
    base64?: string;
    qrcode?: { base64?: string; code?: string; pairingCode?: string };
  };
  if (res.ok) return parseQrPayload(body);

  const msg = `${body.message || ""} ${body.error || ""}`.toLowerCase();
  if (res.status === 403 || msg.includes("already") || msg.includes("exist")) {
    return { qr: null, pairingCode: null };
  }
  throw unprocessable("Falha ao criar instância Evolution", {
    status: res.status,
    message: body.message || body.error,
  });
}

export class EvolutionBaileysProvider implements WhatsAppProvider {
  kind = "evolution_baileys" as const;

  label() {
    return "WhatsApp Web (não oficial)";
  }

  isConfigured() {
    return Boolean(evoBase() && evoKey());
  }

  async ensureInstance(): Promise<void> {
    if (!this.isConfigured()) {
      throw unprocessable("Evolution Baileys não configurada (URL/APIKEY ausentes)");
    }
    if (!(await instanceExists())) {
      await createInstance();
    }
    await this.syncWebhook();
  }

  /** Evolution global webhook não envia secret por padrão; o app recusa com 401. */
  async syncWebhook(): Promise<void> {
    if (!this.isConfigured() || !webhookSecret() || !webhookUrl()) return;
    const name = encodeURIComponent(instance());
    const payloads = [webhookConfigBody(), { webhook: webhookConfigBody() }];
    const urls = [`${evoBase()}/webhook/set/${name}`, `${evoBase()}/webhook/${name}`];
    for (const url of urls) {
      for (const payload of payloads) {
        const res = await evoFetch(url, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify(payload),
        }).catch(() => null);
        if (res?.ok) return;
      }
    }
  }

  async send(input: ProviderSendInput) {
    if (!this.isConfigured()) {
      throw unprocessable("Evolution Baileys não configurada (URL/APIKEY ausentes)");
    }
    const url = `${evoBase()}/message/sendText/${encodeURIComponent(instance())}`;
    const numbers = evolutionSendDestinations(input.toE164);
    const attempts: { status: number; json: unknown }[] = [];
    const quoted = quotedPayload(input.quotedWaMessageId);

    for (const number of numbers) {
      const withQuote = { number, text: input.body, ...quoted };
      const first = await evoFetch(url, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(withQuote),
      });
      const firstJson = (await first.json().catch(() => ({}))) as { key?: { id?: string } };
      if (first.ok) {
        return { waMessageId: firstJson.key?.id ?? null, rawStatus: "sent" };
      }
      attempts.push({ status: first.status, json: firstJson });

      if (quoted && first.status >= 400) {
        const plain = await evoFetch(url, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({ number, text: input.body }),
        });
        const plainJson = (await plain.json().catch(() => ({}))) as { key?: { id?: string } };
        if (plain.ok) {
          return { waMessageId: plainJson.key?.id ?? null, rawStatus: "sent" };
        }
        attempts.push({ status: plain.status, json: plainJson });
      }

      const lastJson = attempts[attempts.length - 1]?.json;
      if (first.status === 400 && evolutionSendLooksLikeLegacySchema(lastJson ?? firstJson)) {
        const retry = await evoFetch(url, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({ number, textMessage: { text: input.body }, ...quoted }),
        });
        const retryJson = (await retry.json().catch(() => ({}))) as { key?: { id?: string } };
        if (retry.ok) {
          return { waMessageId: retryJson.key?.id ?? null, rawStatus: "sent" };
        }
        attempts.push({ status: retry.status, json: retryJson });
        if (quoted) {
          const retryPlain = await evoFetch(url, {
            method: "POST",
            headers: headers(true),
            body: JSON.stringify({ number, textMessage: { text: input.body } }),
          });
          const retryPlainJson = (await retryPlain.json().catch(() => ({}))) as { key?: { id?: string } };
          if (retryPlain.ok) {
            return { waMessageId: retryPlainJson.key?.id ?? null, rawStatus: "sent" };
          }
          attempts.push({ status: retryPlain.status, json: retryPlainJson });
        }
      }
    }

    const last = attempts[attempts.length - 1];
    throw unprocessable(pickRicherEvolutionError("text", attempts), { status: last?.status ?? 400 });
  }

  async sendMedia(input: ProviderSendMediaInput) {
    if (!this.isConfigured()) {
      throw unprocessable("Evolution Baileys não configurada (URL/APIKEY ausentes)");
    }
    const mediaType = input.mime.startsWith("image/")
      ? "image"
      : input.mime.startsWith("audio/")
        ? "audio"
        : "document";
    const quoted = quotedPayload(input.quotedWaMessageId);
    const destinations = evolutionSendDestinations(input.toE164);
    const url = `${evoBase()}/message/sendMedia/${encodeURIComponent(instance())}`;
    const attempts: { status: number; json: unknown }[] = [];
    for (const number of destinations) {
      const base: Record<string, unknown> = {
        number,
        mediatype: mediaType,
        mimetype: input.mime,
        caption: input.body || "",
        fileName: input.fileName,
        media: input.buffer.toString("base64"),
        ...(input.ptt && mediaType === "audio" ? { ptt: true } : {}),
        ...quoted,
      };
      const first = await evoFetch(url, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(base),
      });
      const json = (await first.json().catch(() => ({}))) as { key?: { id?: string } };
      if (first.ok) {
        return { waMessageId: json.key?.id ?? null, rawStatus: "sent" };
      }
      attempts.push({ status: first.status, json });
    }
    const last = attempts[attempts.length - 1];
    throw unprocessable(pickRicherEvolutionError("media", attempts), { status: last?.status ?? 400 });
  }

  async getQr(opts?: GetQrOptions): Promise<QrResult> {
    if (!this.isConfigured()) {
      throw unprocessable("Evolution Baileys não configurada");
    }

    // Fresh poll: one connect, no 25s wait, ignore cache so the dialog can rotate the image.
    if (opts?.fresh) {
      clearEvolutionQr();
      const live = await this.getStatus();
      if (live.status === "open") {
        return { qr: null, pairingCode: null, status: "open" };
      }
      const connect = await this.fetchConnectPayload().catch((error) => {
        if (error instanceof AppError && error.status === 503) throw error;
        return { qr: null, pairingCode: null };
      });
      if (hasQrPayload(connect)) {
        return { ...connect, status: "connecting" };
      }
      return { qr: null, pairingCode: null, status: live.status || "connecting" };
    }

    const hit = readEvolutionQr();
    if (hit?.qr || hit?.pairingCode) {
      return { qr: hit.qr, pairingCode: hit.pairingCode, status: "connecting" };
    }

    if (!(await instanceExists())) {
      const created = await createInstance();
      if (hasQrPayload(created)) {
        return { ...created, status: "connecting" };
      }
    }

    const live = await this.getStatus();
    if (live.status === "open") {
      return { qr: null, pairingCode: null, status: "open" };
    }

    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const connect = await this.fetchConnectPayload().catch((error) => {
        if (error instanceof AppError && error.status === 503) throw error;
        return { qr: null, pairingCode: null };
      });
      if (hasQrPayload(connect)) {
        return { ...connect, status: "connecting" };
      }
      const cached = await waitForQr(1_000);
      if (cached && hasQrPayload(cached)) {
        return { ...cached, status: "connecting" };
      }
    }

    throw unprocessable(
      "QR ainda não gerado pela Evolution. Espere 10s e clique em Obter QR de novo (não precisa de telefone).",
    );
  }

  private async fetchConnectPayload(): Promise<{ qr: string | null; pairingCode: string | null }> {
    const res = await evoFetch(`${evoBase()}/instance/connect/${encodeURIComponent(instance())}`, {
      headers: headers(),
    });
    if (!res.ok) {
      throw unprocessable("Não foi possível obter QR", { status: res.status });
    }
    const json = (await res.json().catch(() => ({}))) as {
      code?: string;
      pairingCode?: string;
      base64?: string;
      count?: number;
      qrcode?: { base64?: string; code?: string; pairingCode?: string; count?: number };
    };
    return parseQrPayload(json);
  }

  async getStatus(): Promise<ProviderStatusResult> {
    if (!this.isConfigured()) {
      return { status: "close", detail: "não configurado" };
    }
    try {
      const res = await fetch(`${evoBase()}/instance/connectionState/${encodeURIComponent(instance())}`, {
        headers: headers(),
      });
      if (!res.ok) {
        if (res.status === 404) return { status: "close", detail: "instance_missing" };
        return { status: "close", detail: `http_${res.status}` };
      }
      const json = (await res.json().catch(() => ({}))) as { instance?: { state?: string } };
      return { status: json.instance?.state || "unknown", detail: "evolution" };
    } catch {
      return { status: "close", detail: "unreachable" };
    }
  }

  async disconnect(): Promise<ProviderStatusResult> {
    if (!this.isConfigured()) {
      throw unprocessable("Evolution Baileys não configurada");
    }
    const res = await evoFetch(`${evoBase()}/instance/logout/${encodeURIComponent(instance())}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!res.ok && !evolutionLogoutAlreadyOff(res.status)) {
      throw unprocessable("Falha ao desconectar instância Evolution", { status: res.status });
    }
    clearEvolutionQr();
    return { status: "close", detail: "logout" };
  }
}
