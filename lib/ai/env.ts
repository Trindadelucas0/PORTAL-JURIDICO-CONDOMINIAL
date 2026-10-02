function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

function envFloat(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/** Timeout of `complete()` in the inbound worker. Embed uses `aiEmbedTimeoutMs`. */
export function aiTimeoutMs(): number {
  return envInt("AI_TIMEOUT_MS", 120_000, 10_000, 600_000);
}

export function aiEmbedTimeoutMs(): number {
  return envInt("AI_EMBED_TIMEOUT_MS", 25_000, 5_000, 120_000);
}

export function aiMaxOutputTokens(): number {
  return envInt("AI_MAX_OUTPUT_TOKENS", 4096, 256, 16_384);
}

export function aiChunkChars(): number {
  return envInt("AI_CHUNK_CHARS", 1000, 200, 8000);
}

export function aiChunkOverlap(): number {
  const size = aiChunkChars();
  const overlap = envInt("AI_CHUNK_OVERLAP", 150, 0, 4000);
  return Math.min(overlap, Math.max(0, size - 1));
}

export function retrievalDistanceLimit(): number {
  return envFloat("AI_RETRIEVAL_DISTANCE_LIMIT", 0.75, 0.1, 1);
}
