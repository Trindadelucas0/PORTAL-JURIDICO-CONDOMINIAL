import { brazilWhatsAppNumberVariants, isLidPeer } from "@/lib/phone/identity";

export function whatsAppNumberFromE164(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** Destino Evolution: E.164 BR (variante 8↔9) ou JID `@lid` quando o WhatsApp não mandou telefone. */
export function evolutionSendDestinations(to: string): string[] {
  const trimmed = to.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  if (lower.includes("@lid") || lower.endsWith(".lid")) return [trimmed];
  if (isLidPeer(trimmed)) {
    const digits = trimmed.replace(/^\+999/, "").replace(/\D/g, "");
    return digits ? [`${digits}@lid`] : [];
  }
  return brazilWhatsAppNumberVariants(whatsAppNumberFromE164(trimmed));
}

export function isBaileysSessionOpen(status: string): boolean {
  const s = status.toLowerCase();
  return s === "open" || s === "connected";
}

export function mapBaileysLiveToDb(status: string): "open" | "connecting" | "close" | null {
  const s = status.toLowerCase();
  if (s === "open" || s === "connected") return "open";
  if (s === "connecting" || s === "qr" || s === "qrcode") return "connecting";
  if (s === "close" || s === "closed" || s === "disconnected" || s === "logout" || s === "unknown") return "close";
  return null;
}

export function evolutionLogoutAlreadyOff(status: number): boolean {
  return status === 400 || status === 404;
}

export const EVOLUTION_UNREACHABLE_MESSAGE =
  "Evolution API não está no ar. No notebook: docker compose up -d na pasta do portal e tente Conectar de novo.";

export function isEvolutionUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const cause =
    "cause" in error ? (error as { cause?: { code?: string; message?: string } }).cause : undefined;
  const causeCode = (cause?.code || "").toLowerCase();
  const causeMsg = (cause?.message || "").toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("und_err_connect_timeout") ||
    causeCode === "econnrefused" ||
    causeCode === "etimedout" ||
    causeCode === "econnreset" ||
    causeCode === "und_err_connect_timeout" ||
    causeMsg.includes("econnrefused")
  );
}

function evolutionExistsFalse(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as { exists?: unknown }).exists === false;
}

function flattenEvolutionField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (evolutionExistsFalse(value)) return "exists: false";
  if (Array.isArray(value)) {
    if (value.some(evolutionExistsFalse)) return "exists: false";
    const joined = value
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .join("; ");
    if (joined) return joined;
  }
  return undefined;
}

function evolutionErrorSnippet(json: unknown): string {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const nested = body.response && typeof body.response === "object" ? (body.response as Record<string, unknown>) : {};
  const rawCandidates = [nested.message, body.message, body.error, nested.error];
  const raw = rawCandidates.map(flattenEvolutionField).find((v) => Boolean(v));
  return (raw || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function describeEvolutionError(status: number, json: unknown, kind: "text" | "media" = "text"): string {
  const snippet = evolutionErrorSnippet(json);
  const prefix = kind === "media" ? "Evolution recusou mídia" : "Evolution recusou envio";
  return snippet ? `${prefix} (${status}): ${snippet}` : `${prefix} (${status})`;
}

function isGenericEvolutionError(message: string): boolean {
  const lower = message.toLowerCase();
  return /: bad request$/.test(lower) || /recusou (envio|mídia) \(\d+\)$/.test(lower);
}

export function pickRicherEvolutionError(
  kind: "text" | "media",
  attempts: { status: number; json: unknown }[],
): string {
  const described = attempts.map((attempt) => describeEvolutionError(attempt.status, attempt.json, kind));
  return described.find((msg) => !isGenericEvolutionError(msg)) || described[described.length - 1] || described[0] || describeEvolutionError(400, {}, kind);
}

export function evolutionSendLooksLikeLegacySchema(json: unknown): boolean {
  const text = evolutionErrorSnippet(json).toLowerCase();
  if (!text) return false;
  return (
    text.includes("textmessage") ||
    /\bproperty text\b/.test(text) ||
    /\btext (must|should|is required)\b/.test(text) ||
    /\bmust (be a string|have).*text\b/.test(text)
  );
}

export { brazilWhatsAppNumberVariants } from "@/lib/phone/identity";
