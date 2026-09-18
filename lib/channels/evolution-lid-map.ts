import { phoneFromWhatsAppLid } from "@/lib/channels/evolution-webhook";
import { isLidPeer } from "@/lib/phone/identity";

export type EvolutionChatLidRow = {
  remoteJid?: string;
  pushName?: string;
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

function chatRows(json: unknown): EvolutionChatLidRow[] {
  if (Array.isArray(json)) return json.filter((row): row is EvolutionChatLidRow => Boolean(row) && typeof row === "object");
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const key of ["chats", "data", "items"]) {
      if (Array.isArray(record[key])) return chatRows(record[key]);
    }
  }
  return [];
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

async function fetchEvolutionChatRows(): Promise<EvolutionChatLidRow[] | null> {
  if (process.env.VITEST) return null;
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "") || "";
  const key = process.env.EVOLUTION_APIKEY || "";
  const instance = process.env.EVOLUTION_INSTANCE || "juricon";
  if (!base || !key) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/chat/findChats/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    return chatRows(json);
  } catch {
    return null;
  }
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
