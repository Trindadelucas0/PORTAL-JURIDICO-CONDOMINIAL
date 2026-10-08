import { phoneFromWhatsAppLid } from "@/lib/channels/evolution-webhook";
import { normalizeE164 } from "@/lib/phone/e164";
import { isLidPeer, isOrphanPeer } from "@/lib/phone/identity";
import {
  contactNameMatchesPushName,
  fetchEvolutionChatRows,
  fetchEvolutionMessages,
  lidJidsMatchingPlaceholder,
  type EvolutionChatLidRow,
  type EvolutionContactRow,
  type EvolutionMessageRow,
} from "@/lib/channels/evolution-lid-map";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Digits / JID → real E.164 (ignores @lid, grupo, +999/+998). */
export function phoneFromPnCandidate(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes("@lid") || lower.includes("@g.us") || lower.includes("status@broadcast")) {
    return null;
  }
  const user = (raw.split("@")[0] || "").split(":")[0];
  const digits = user.replace(/\D/g, "");
  if (!digits) return null;
  const phone =
    normalizeE164(digits.startsWith("55") ? `+${digits}` : digits) || normalizeE164(`+${digits}`);
  if (!phone || isLidPeer(phone) || isOrphanPeer(phone)) return null;
  return phone;
}

function phoneFromChatPnFields(chat: EvolutionChatLidRow): string | null {
  const candidates = [
    chat.remoteJidAlt,
    chat.remote_jid_alt,
    chat.senderPn,
    chat.sender_pn,
    chat.pn,
    chat.participantPn,
  ];
  for (const raw of candidates) {
    const jid = asString(raw);
    if (!jid) continue;
    const phone = phoneFromPnCandidate(jid);
    if (phone) return phone;
  }
  return null;
}

/** PN E.164 from a findMessages row (key + envelope fields). */
export function phoneFromMessageRow(row: EvolutionMessageRow): string | null {
  const key = row.key && typeof row.key === "object" ? row.key : {};
  const contextInfo = row.contextInfo && typeof row.contextInfo === "object" ? row.contextInfo : null;
  const remote = asString(key.remoteJid);
  if (remote) {
    const fromRemote = phoneFromPnCandidate(remote);
    if (fromRemote) return fromRemote;
  }
  const candidates = [
    key.remoteJidAlt,
    key.remote_jid_alt,
    key.senderPn,
    key.sender_pn,
    key.participantPn,
    key.participant_pn,
    row.remoteJidAlt,
    row.remote_jid_alt,
    row.senderPn,
    row.sender_pn,
    row.participantPn,
    row.previousRemoteJid,
    row.previous_remote_jid,
    key.previousRemoteJid,
    key.previous_remote_jid,
    contextInfo?.participant,
    contextInfo?.participantPn,
    contextInfo?.remoteJidAlt,
  ];
  for (const raw of candidates) {
    const jid = asString(raw);
    if (!jid) continue;
    const phone = phoneFromPnCandidate(jid);
    if (phone) return phone;
  }
  return null;
}

function messageMatchesLid(row: EvolutionMessageRow, lidPlaceholder: string, lidJid?: string): boolean {
  const remote = asString(row.key?.remoteJid) || "";
  if (lidJid && remote === lidJid) return true;
  if (remote.toLowerCase().includes("@lid") && phoneFromWhatsAppLid(remote) === lidPlaceholder) {
    return true;
  }
  return false;
}

/** PN E.164 for a LID placeholder from Evolution findChats rows. */
export function resolvePhoneFromLidChats(chats: EvolutionChatLidRow[], lidPlaceholder: string): string | null {
  if (!isLidPeer(lidPlaceholder)) return null;
  for (const chat of chats) {
    const jid = chat.remoteJid || "";
    if (!jid.toLowerCase().includes("@lid")) continue;
    if (phoneFromWhatsAppLid(jid) !== lidPlaceholder) continue;
    const phone = phoneFromChatPnFields(chat);
    if (phone) return phone;
  }
  return null;
}

/** PN from messages that belong to this LID chat. */
export function resolvePhoneFromMessages(
  rows: EvolutionMessageRow[],
  lidPlaceholder: string,
  opts?: { waMessageId?: string; lidJid?: string },
): string | null {
  if (!isLidPeer(lidPlaceholder)) return null;
  if (opts?.waMessageId) {
    const byId = rows.find((row) => asString(row.key?.id) === opts.waMessageId);
    if (byId) {
      const phone = phoneFromMessageRow(byId);
      if (phone) return phone;
    }
  }
  for (const row of rows) {
    if (!messageMatchesLid(row, lidPlaceholder, opts?.lidJid)) continue;
    const phone = phoneFromMessageRow(row);
    if (phone) return phone;
  }
  return null;
}

function contactDisplayName(contact: EvolutionContactRow): string {
  return (
    asString(contact.pushName) ||
    asString(contact.pushname) ||
    asString(contact.notify) ||
    asString(contact.name) ||
    ""
  );
}

function contactPhoneJid(contact: EvolutionContactRow): string | null {
  for (const raw of [contact.remoteJid, contact.id]) {
    const jid = asString(raw);
    if (!jid) continue;
    if (phoneFromPnCandidate(jid)) return jid;
  }
  return null;
}

/**
 * PN único da agenda cujo nome casa com o pushName.
 * Zero ou mais de um match → null (não inventa número).
 */
export function resolvePhoneFromContacts(contacts: EvolutionContactRow[], pushName: string): string | null {
  const name = pushName.trim();
  if (!name) return null;
  const phones = new Set<string>();
  for (const contact of contacts) {
    const jid = contactPhoneJid(contact);
    if (!jid) continue;
    if (!contactNameMatchesPushName(contactDisplayName(contact), name)) continue;
    const phone = phoneFromPnCandidate(jid);
    if (phone) phones.add(phone);
  }
  if (phones.size !== 1) return null;
  return [...phones][0] ?? null;
}

export type ResolvePhoneForLidPeerOpts = {
  /** Cascata findChats + findMessages desta waMessageId (só no enrich-peer / Puxar). */
  deep?: boolean;
  waMessageId?: string;
  pushName?: string | null;
};

/** Look up real phone for a LID peer via Evolution (shallow: findChats; deep: + messages). */
export async function resolvePhoneForLidPeer(
  lidPlaceholder: string,
  opts?: ResolvePhoneForLidPeerOpts,
): Promise<string | null> {
  if (!isLidPeer(lidPlaceholder)) return null;

  const chats = await fetchEvolutionChatRows();
  if (chats) {
    const fromChat = resolvePhoneFromLidChats(chats, lidPlaceholder);
    if (fromChat) return fromChat;
  }
  if (!opts?.deep) return null;

  const lidJids = chats ? lidJidsMatchingPlaceholder(chats, lidPlaceholder) : [];
  const lidJid = lidJids.length === 1 ? lidJids[0] : lidJids[0];

  const messages = await fetchEvolutionMessages({
    waMessageId: opts.waMessageId,
    remoteJid: lidJid,
  });
  if (messages) {
    const fromMsg = resolvePhoneFromMessages(messages, lidPlaceholder, {
      waMessageId: opts.waMessageId,
      lidJid,
    });
    if (fromMsg) return fromMsg;
  }
  return null;
}

function evoBase() {
  return process.env.EVOLUTION_API_URL?.replace(/\/$/, "") || "";
}
function evoKey() {
  return process.env.EVOLUTION_APIKEY || "";
}
function instance() {
  return process.env.EVOLUTION_INSTANCE || "juricon";
}

function contactJid(contact: EvolutionContactRow): string {
  return (contact.remoteJid || contact.id || "").trim();
}

function contactPushName(contact: EvolutionContactRow): string {
  return (
    asString(contact.pushName) ||
    asString(contact.pushname) ||
    asString(contact.notify) ||
    asString(contact.name) ||
    ""
  ).trim();
}

function contactProfilePicUrl(contact: EvolutionContactRow): string | null {
  const url = asString(contact.profilePicUrl) || asString(contact.profilePictureUrl) || "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url;
}

export type EvolutionPeerHint = {
  jid: string | null;
  pushName: string | null;
  profilePicUrl: string | null;
};

/**
 * Nome e foto do Contact/chat da Evolution para o JID desta conversa.
 * LID: só se houver um único JID cujo placeholder coincide. Vários → nada.
 * Telefone: JID `@s.whatsapp.net` (também aceita `@c.us` já salvo no Contact).
 */
export function evolutionPeerHint(
  peer: string,
  contacts: EvolutionContactRow[],
  chats: EvolutionChatLidRow[],
): EvolutionPeerHint {
  const empty: EvolutionPeerHint = { jid: null, pushName: null, profilePicUrl: null };
  if (!peer) return empty;

  if (isLidPeer(peer)) {
    const jids = new Set<string>();
    for (const contact of contacts) {
      const jid = contactJid(contact);
      if (jid.toLowerCase().includes("@lid") && phoneFromWhatsAppLid(jid) === peer) jids.add(jid);
    }
    for (const chat of chats) {
      const jid = chat.remoteJid || "";
      if (jid.toLowerCase().includes("@lid") && phoneFromWhatsAppLid(jid) === peer) jids.add(jid);
    }
    if (jids.size !== 1) return empty;
    const jid = [...jids][0]!;
    const contact = contacts.find((row) => contactJid(row) === jid);
    const chat = chats.find((row) => (row.remoteJid || "") === jid);
    const pushName = (contact ? contactPushName(contact) : "") || (chat?.pushName || "").trim() || null;
    return { jid, pushName, profilePicUrl: contact ? contactProfilePicUrl(contact) : null };
  }

  const digits = peer.replace(/\D/g, "");
  if (!digits) return empty;
  const pn = `${digits}@s.whatsapp.net`;
  const cus = `${digits}@c.us`;
  const contact = contacts.find((row) => {
    const jid = contactJid(row).toLowerCase();
    return jid === pn || jid === cus;
  });
  const chat = chats.find((row) => {
    const jid = (row.remoteJid || "").toLowerCase();
    return jid === pn || jid === cus;
  });
  const pushName = (contact ? contactPushName(contact) : "") || (chat?.pushName || "").trim() || null;
  return { jid: pn, pushName, profilePicUrl: contact ? contactProfilePicUrl(contact) : null };
}

/** Corpo da rota real da Evolution 2.2.3: POST JSON `{ number }`, nunca GET. */
export function evolutionProfilePictureRequest(number: string): { method: "POST"; body: { number: string } } {
  return { method: "POST", body: { number } };
}

/**
 * URL da foto para um JID completo (`@lid` ou `@s.whatsapp.net`).
 * O `wuid` da resposta é o JID pedido — não vira telefone.
 * Null em teste, sem config ou sem URL http(s).
 */
export async function fetchEvolutionProfilePictureUrl(numberJid: string): Promise<string | null> {
  if (process.env.VITEST) return null;
  const base = evoBase();
  const key = evoKey();
  if (!base || !key || !numberJid.includes("@")) return null;

  const request = evolutionProfilePictureRequest(numberJid);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const url = `${base}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance())}`;
    const res = await fetch(url, {
      method: request.method,
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!json || typeof json !== "object") return null;
    const record = json as Record<string, unknown>;
    const profile =
      asString(record.profilePictureUrl) ||
      asString(record.profilePicUrl) ||
      asString(record.url) ||
      (record.data && typeof record.data === "object"
        ? asString((record.data as Record<string, unknown>).profilePictureUrl) ||
          asString((record.data as Record<string, unknown>).url)
        : undefined);
    if (!profile || !/^https?:\/\//i.test(profile)) return null;
    return profile;
  } catch {
    return null;
  }
}
