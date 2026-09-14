export type CachedQr = { qr: string | null; pairingCode: string | null; at: number };

const ttlMs = 120_000;
let cached: CachedQr | null = null;

export function rememberEvolutionQr(input: { qr?: string | null; pairingCode?: string | null }) {
  if (!input.qr && !input.pairingCode) return;
  cached = {
    qr: input.qr || null,
    pairingCode: input.pairingCode || null,
    at: Date.now(),
  };
}

export function readEvolutionQr(): CachedQr | null {
  if (!cached) return null;
  if (Date.now() - cached.at > ttlMs) {
    cached = null;
    return null;
  }
  return cached;
}

export function clearEvolutionQr() {
  cached = null;
}
