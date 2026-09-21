export type CachedQr = { qr: string | null; pairingCode: string | null; at: number };

/** WhatsApp Web rotates QR ~20s; keep cache aligned so we never serve a dead code. */
export const EVOLUTION_QR_TTL_MS = 20_000;

let cached: CachedQr | null = null;

function looksLikeImageQr(value: string | null | undefined): boolean {
  if (!value || value.length < 40) return false;
  if (value.startsWith("data:image")) return true;
  if (value.startsWith("data:")) return false;
  // Raw base64 PNG (common Evolution payload without data: prefix)
  return /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100;
}

function looksLikeTextCodeOnly(value: string | null | undefined): boolean {
  if (!value || value.length < 40) return false;
  return !looksLikeImageQr(value);
}

export function rememberEvolutionQr(input: { qr?: string | null; pairingCode?: string | null }) {
  if (!input.qr && !input.pairingCode) return;

  const nextQr = input.qr || null;
  const nextPair = input.pairingCode || null;
  const existing = cached;

  // Webhook QRCODE_UPDATED often sends only `code` (no PNG). Do not replace a good image with text.
  if (existing?.qr && looksLikeImageQr(existing.qr) && nextQr && looksLikeTextCodeOnly(nextQr)) {
    cached = {
      qr: existing.qr,
      pairingCode: nextPair ?? existing.pairingCode,
      at: Date.now(),
    };
    return;
  }

  cached = {
    qr: nextQr ?? existing?.qr ?? null,
    pairingCode: nextPair ?? existing?.pairingCode ?? null,
    at: Date.now(),
  };
}

export function readEvolutionQr(): CachedQr | null {
  if (!cached) return null;
  if (Date.now() - cached.at > EVOLUTION_QR_TTL_MS) {
    cached = null;
    return null;
  }
  return cached;
}

export function clearEvolutionQr() {
  cached = null;
}
