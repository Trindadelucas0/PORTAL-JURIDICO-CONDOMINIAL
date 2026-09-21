import { phoneFromWhatsAppLid } from "@/lib/channels/evolution-webhook";
import { normalizeE164 } from "@/lib/phone/e164";
import { isLidPeer } from "@/lib/phone/identity";
import {
  fetchEvolutionChatRows,
  lidJidsMatchingPlaceholder,
  type EvolutionChatLidRow,
} from "@/lib/channels/evolution-lid-map";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
    const lower = jid.toLowerCase();
    if (lower.includes("@lid") || lower.includes("@g.us")) continue;
    const user = (jid.split("@")[0] || "").split(":")[0];
    const digits = user.replace(/\D/g, "");
    if (!digits) continue;
    const phone =
      normalizeE164(digits.startsWith("55") ? `+${digits}` : digits) || normalizeE164(`+${digits}`);
    if (phone && !isLidPeer(phone)) return phone;
  }
  return null;
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

/** Look up real phone for a LID peer via Evolution findChats. */
export async function resolvePhoneForLidPeer(lidPlaceholder: string): Promise<string | null> {
  if (!isLidPeer(lidPlaceholder)) return null;
  const rows = await fetchEvolutionChatRows();
  if (!rows) return null;
  return resolvePhoneFromLidChats(rows, lidPlaceholder);
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

/**
 * Evolution profile picture URL for a phone E.164 or LID placeholder.
 * Returns null on miss / VITEST / misconfig.
 */
export async function fetchEvolutionProfilePictureUrl(peer: string): Promise<string | null> {
  if (process.env.VITEST) return null;
  const base = evoBase();
  const key = evoKey();
  if (!base || !key) return null;

  let number: string;
  if (isLidPeer(peer)) {
    const rows = await fetchEvolutionChatRows();
    if (!rows) return null;
    const jids = lidJidsMatchingPlaceholder(rows, peer);
    if (jids.length !== 1) return null;
    number = jids[0]!;
  } else {
    number = peer.replace(/\D/g, "");
    if (!number) return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const url = `${base}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance())}?number=${encodeURIComponent(number)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { apikey: key },
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
