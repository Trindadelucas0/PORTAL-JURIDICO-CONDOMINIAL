export function whatsAppNumberFromE164(e164: string): string {
  return e164.replace(/\D/g, "");
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

export function describeEvolutionError(status: number, json: unknown, kind: "text" | "media" = "text"): string {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const nested = body.response && typeof body.response === "object" ? (body.response as Record<string, unknown>) : {};
  const rawCandidates = [nested.message, body.message, body.error, nested.error];
  const raw = rawCandidates.find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const snippet = (raw || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const prefix = kind === "media" ? "Evolution recusou mídia" : "Evolution recusou envio";
  return snippet ? `${prefix} (${status}): ${snippet}` : `${prefix} (${status})`;
}
