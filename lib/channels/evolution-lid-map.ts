import { phoneFromWhatsAppLid } from "@/lib/channels/evolution-webhook";
import { isLidPeer } from "@/lib/phone/identity";

export type EvolutionChatLidRow = {
  remoteJid?: string;
  pushName?: string;
  remoteJidAlt?: string;
  remote_jid_alt?: string;
  senderPn?: string;
  sender_pn?: string;
  participantPn?: string;
  pn?: string;
};

export type EvolutionMessageRow = {
  key?: {
    id?: string;
    remoteJid?: string;
    remoteJidAlt?: string;
    remote_jid_alt?: string;
    senderPn?: string;
    sender_pn?: string;
    participantPn?: string;
    participant_pn?: string;
    previousRemoteJid?: string;
    previous_remote_jid?: string;
  };
  remoteJidAlt?: string;
  remote_jid_alt?: string;
  senderPn?: string;
  sender_pn?: string;
  participantPn?: string;
  previousRemoteJid?: string;
  previous_remote_jid?: string;
  contextInfo?: {
    participant?: string;
    participantPn?: string;
    remoteJidAlt?: string;
  };
};

export type EvolutionContactRow = {
  remoteJid?: string;
  id?: string;
  pushName?: string;
  pushname?: string;
  notify?: string;
  name?: string;
  profilePicUrl?: string;
  profilePictureUrl?: string;
};

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Nome do cadastro vs pushName do chat WhatsApp. Primeiro token curto (<4) não casa sozinho. */
export function contactNameMatchesPushName(contactNome: string, pushName: string): boolean {
  const contact = normalizePersonName(contactNome);
  const push = normalizePersonName(pushName);
  if (!contact || !push) return false;
  if (contact === push) return true;
  const contactFirst = contact.split(" ")[0] ?? "";
  const pushFirst = push.split(" ")[0] ?? "";
  if (contactFirst.length < 4 || contactFirst !== pushFirst) return false;
  if (!contact.includes(" ")) return true;
  return push.startsWith(contact) || contact.startsWith(push);
}

export function pickUniqueLidPlaceholder(chats: EvolutionChatLidRow[], contactNome: string): string | null {
  const lids = new Set<string>();
  for (const chat of chats) {
    const jid = chat.remoteJid || "";
    if (!jid.toLowerCase().includes("@lid")) continue;
    if (!contactNameMatchesPushName(contactNome, chat.pushName || "")) continue;
    const lid = phoneFromWhatsAppLid(jid);
    if (lid) lids.add(lid);
  }
  if (lids.size !== 1) return null;
  return [...lids][0] ?? null;
}

/**
 * Evolution 2.2.x devolve shapes aninhados, ex.:
 * `{ messages: { records: [...] } }` — `messages` é objeto, não array.
 * Percorre nestKeys em arrays e em objetos até achar a lista de rows.
 */
function rowsFromJson<T extends object>(json: unknown, nestKeys: string[]): T[] {
  if (Array.isArray(json)) {
    return json.filter((row): row is T => Boolean(row) && typeof row === "object");
  }
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const key of nestKeys) {
      const nested = record[key];
      if (Array.isArray(nested)) return rowsFromJson<T>(nested, nestKeys);
      if (nested && typeof nested === "object") {
        const deeper = rowsFromJson<T>(nested, nestKeys);
        if (deeper.length > 0) return deeper;
      }
    }
  }
  return [];
}

export function chatRows(json: unknown): EvolutionChatLidRow[] {
  return rowsFromJson<EvolutionChatLidRow>(json, ["chats", "data", "items"]);
}

export function messageRows(json: unknown): EvolutionMessageRow[] {
  return rowsFromJson<EvolutionMessageRow>(json, ["messages", "data", "items", "records"]);
}

export function contactRows(json: unknown): EvolutionContactRow[] {
  return rowsFromJson<EvolutionContactRow>(json, ["contacts", "data", "items"]);
}

async function postEvolutionJson(path: string, body: Record<string, unknown>): Promise<unknown | null> {
  if (process.env.VITEST) return null;
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "") || "";
  const key = process.env.EVOLUTION_APIKEY || "";
  const instance = process.env.EVOLUTION_INSTANCE || "juricon";
  if (!base || !key) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}${path}/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export function lidJidsMatchingPlaceholder(chats: EvolutionChatLidRow[], placeholder: string): string[] {
  const hits: string[] = [];
  for (const chat of chats) {
    const jid = chat.remoteJid || "";
    if (!jid.toLowerCase().includes("@lid")) continue;
    if (phoneFromWhatsAppLid(jid) === placeholder) hits.push(jid);
  }
  return [...new Set(hits)];
}

export async function fetchEvolutionChatRows(): Promise<EvolutionChatLidRow[] | null> {
  const json = await postEvolutionJson("/chat/findChats", {});
  if (json === null) return null;
  return chatRows(json);
}

/** Mensagens da Evolution (2.2.3). Preferir id; se vazio, filtrar no app pelo remoteJid. */
export async function fetchEvolutionMessages(opts: {
  waMessageId?: string;
  remoteJid?: string;
  limit?: number;
}): Promise<EvolutionMessageRow[] | null> {
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 50) : 50;
  if (opts.waMessageId) {
    const byId = await postEvolutionJson("/chat/findMessages", {
      where: { key: { id: opts.waMessageId } },
      limit,
    });
    if (byId !== null) {
      const rows = messageRows(byId);
      if (rows.length > 0) return rows.slice(0, limit);
    }
  }
  if (opts.remoteJid) {
    const byJid = await postEvolutionJson("/chat/findMessages", {
      where: { key: { remoteJid: opts.remoteJid } },
      limit,
    });
    if (byJid === null) return null;
    return messageRows(byJid).slice(0, limit);
  }
  return null;
}

/** Agenda completa da Evolution (where.id é ignorado na 2.2.3 — filtrar no app). */
export async function fetchEvolutionContacts(): Promise<EvolutionContactRow[] | null> {
  const json = await postEvolutionJson("/chat/findContacts", {});
  if (json === null) return null;
  return contactRows(json);
}

/** Consulta chats da Evolution e devolve o placeholder LID só se o nome casar com um único chat `@lid`. */
export async function resolveUniqueLidPlaceholderForContact(nome: string): Promise<string | null> {
  if (!nome.trim()) return null;
  const rows = await fetchEvolutionChatRows();
  if (!rows) return null;
  return pickUniqueLidPlaceholder(rows, nome);
}

/** JID `@lid` completo do chat cujo placeholder (últimos 12 dígitos) coincide. */
export async function resolveLidJidForPlaceholder(placeholder: string): Promise<string | null> {
  if (!isLidPeer(placeholder)) return null;
  const rows = await fetchEvolutionChatRows();
  if (!rows) return null;
  const hits = lidJidsMatchingPlaceholder(rows, placeholder);
  return hits.length === 1 ? hits[0]! : null;
}
