import { normalizeE164 } from "@/lib/phone/e164";
import { isLidPeer } from "@/lib/phone/identity";

export type EvolutionInboundMessage = {
  waMessageId: string;
  fromPhone: string;
  body: string;
  waLid: string | null;
  pushName?: string | null;
};

export type EvolutionWebhookResult =
  | { kind: "malformed"; reason: "malformed" }
  | { kind: "qrcode"; qr: string | null; pairingCode: string | null }
  | { kind: "ignored"; reason: string }
  | { kind: "messages"; items: EvolutionInboundMessage[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return undefined;
}

function eventName(body: Record<string, unknown>): string {
  return (asString(body.event) || "").toLowerCase();
}

function dataRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) {
    if (Array.isArray(data.messages)) return data.messages.filter(isRecord);
    return [data];
  }
  return [];
}

function nestedText(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined;
  const inner = obj[key];
  if (!isRecord(inner)) return undefined;
  return asString(inner.text) || asString(inner.caption);
}

export function extractMessageText(message: unknown): string {
  if (!isRecord(message)) return "";
  return (
    asString(message.conversation) ||
    nestedText(message, "extendedTextMessage") ||
    nestedText(message, "imageMessage") ||
    nestedText(message, "videoMessage") ||
    nestedText(message, "documentMessage") ||
    asString(message.caption) ||
    ""
  );
}

function isGroupOrStatusJid(jid: string): boolean {
  const lower = jid.toLowerCase();
  return lower.includes("@g.us") || lower.includes("status@broadcast") || lower.endsWith("@broadcast");
}

function isLidJid(jid: string): boolean {
  const lower = jid.toLowerCase();
  return lower.includes("@lid") || lower.endsWith(".lid");
}

function isPhoneJid(jid: string): boolean {
  const lower = jid.toLowerCase();
  return lower.includes("@s.whatsapp.net") || lower.includes("@c.us");
}

/** User part of a JID, without device/agent suffix (`number:device@s.whatsapp.net`). */
function jidUserPart(jid: string): string {
  return (jid.split("@")[0] || "").split(":")[0];
}

/** LID do WhatsApp não é E.164. +999 + 12 dígitos (máx. E.164) identifica o peer sem parecer telefone real. */
export function phoneFromWhatsAppLid(jid: string): string | null {
  const digits = jidUserPart(jid).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 20) return null;
  return `+999${digits.slice(-12)}`;
}

function phoneFromPnCandidate(jid: string): string | null {
  if (isGroupOrStatusJid(jid) || isLidJid(jid)) return null;
  const digits = jidUserPart(jid).replace(/\D/g, "");
  if (!digits) return null;
  const phone = normalizeE164(digits.startsWith("55") ? `+${digits}` : digits) || normalizeE164(`+${digits}`);
  if (!phone || isLidPeer(phone)) return null;
  return phone;
}

function lidFromCandidates(candidates: string[]): string | null {
  for (const jid of candidates) {
    if (isLidJid(jid)) {
      const lid = phoneFromWhatsAppLid(jid);
      if (lid) return lid;
    }
  }
  return null;
}

function phoneFromKey(
  key: Record<string, unknown>,
  extras: string[] = [],
): { phone: string | null; waLid: string | null; group: boolean } {
  const candidates = [
    key.remoteJidAlt,
    key.remote_jid_alt,
    key.senderPn,
    key.sender_pn,
    key.participantPn,
    key.participant_pn,
    key.participantAlt,
    key.previousRemoteJid,
    key.previous_remote_jid,
    key.remoteJid,
    key.participant,
    ...extras,
  ]
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));
  const primary = asString(key.remoteJid);
  if (primary && isGroupOrStatusJid(primary)) return { phone: null, waLid: null, group: true };

  const waLid = lidFromCandidates(candidates);

  for (const jid of candidates) {
    if (!isPhoneJid(jid)) continue;
    const phone = phoneFromPnCandidate(jid);
    if (phone) return { phone, waLid, group: false };
  }
  for (const jid of candidates) {
    if (isLidJid(jid) || isGroupOrStatusJid(jid)) continue;
    const phone = phoneFromPnCandidate(jid);
    if (phone) return { phone, waLid, group: false };
  }
  if (waLid) return { phone: waLid, waLid, group: false };
  return { phone: null, waLid, group: false };
}

function extractQr(records: Record<string, unknown>[]): { qr: string | null; pairingCode: string | null } {
  let qr: string | null = null;
  let pairingCode: string | null = null;
  for (const row of records) {
    const nested = isRecord(row.qrcode) ? row.qrcode : null;
    const rawQr = asString(row.base64) || (nested ? asString(nested.base64) : undefined);
    const rawCode = asString(row.code) || (nested ? asString(nested.code) : undefined);
    const nextQr =
      (rawQr && rawQr.length > 40 ? rawQr : null) || (rawCode && rawCode.length > 40 ? rawCode : null);
    if (nextQr) qr = nextQr;
    const nextPair = asString(row.pairingCode) || (nested ? asString(nested.pairingCode) : undefined);
    if (nextPair) pairingCode = nextPair;
  }
  return { qr, pairingCode };
}

function extractInbound(row: Record<string, unknown>):
  | { skip: string }
  | { item: EvolutionInboundMessage } {
  const key = isRecord(row.key) ? row.key : {};
  if (asBool(key.fromMe)) return { skip: "fromMe" };
  const extraJids = [
    row.senderPn,
    row.sender_pn,
    row.remoteJidAlt,
    row.remote_jid_alt,
    row.participantPn,
    row.previousRemoteJid,
    row.previous_remote_jid,
  ]
    .map((v) => asString(v) || "")
    .filter(Boolean);
  const { phone, waLid, group } = phoneFromKey(key, extraJids);
  if (group) return { skip: "group" };
  const waMessageId = asString(key.id);
  if (!waMessageId || !phone) return { skip: "incomplete" };
  const text = extractMessageText(row.message);
  const pushName = sanitizePushName(asString(row.pushName) || asString(row.pushname) || asString(row.notifyName));
  return {
    item: {
      waMessageId,
      fromPhone: phone,
      waLid: waLid || (phone.startsWith("+999") ? phone : null),
      body: text || "(mídia ou mensagem sem texto)",
      ...(pushName ? { pushName } : {}),
    },
  };
}

function sanitizePushName(value?: string): string | null {
  const text = value?.trim().replace(/\s+/g, " ");
  if (!text || text.length < 2 || text.length > 80) return null;
  if (/^\+?\d[\d\s()-]{6,}$/.test(text)) return null;
  return text;
}

export function interpretEvolutionWebhook(body: unknown): EvolutionWebhookResult {
  if (!isRecord(body)) return { kind: "malformed", reason: "malformed" };
  const event = eventName(body);
  const records = dataRecords(body.data);

  if (event.includes("qrcode")) {
    const qr = extractQr(records);
    return { kind: "qrcode", qr: qr.qr, pairingCode: qr.pairingCode };
  }

  const items: EvolutionInboundMessage[] = [];
  const skipReasons = new Set<string>();
  for (const row of records) {
    const extracted = extractInbound(row);
    if ("skip" in extracted) skipReasons.add(extracted.skip);
    else items.push(extracted.item);
  }

  if (items.length > 0) return { kind: "messages", items };
  if (skipReasons.has("fromMe") && skipReasons.size === 1) return { kind: "ignored", reason: "fromMe" };
  if (skipReasons.has("group") && !skipReasons.has("incomplete")) return { kind: "ignored", reason: "group" };
  if (skipReasons.has("fromMe")) return { kind: "ignored", reason: "fromMe" };
  if (skipReasons.has("group")) return { kind: "ignored", reason: "group" };
  return { kind: "ignored", reason: records.length ? "incomplete" : "ignored" };
}
