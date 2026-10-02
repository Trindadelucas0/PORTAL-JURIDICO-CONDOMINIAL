import { afterEach, describe, expect, it } from "vitest";
import { aiChunkChars, aiTimeoutMs, retrievalDistanceLimit } from "@/lib/ai/env";
import { shouldMarkJobDead } from "@/lib/ai/complete-json";
import { chunkText } from "@/lib/ai/chunks";
import { confidenceBand } from "@/lib/ai/confidence";
import { analiseInterrompidaTexto } from "@/lib/ai/analise-copy";

describe("AI env and job retry", () => {
  afterEach(() => {
    delete process.env.AI_TIMEOUT_MS;
    delete process.env.AI_CHUNK_CHARS;
    delete process.env.AI_RETRIEVAL_DISTANCE_LIMIT;
  });

  it("defaults chat timeout to 120s", () => {
    expect(aiTimeoutMs()).toBe(120_000);
    process.env.AI_TIMEOUT_MS = "90000";
    expect(aiTimeoutMs()).toBe(90_000);
  });

  it("kills TIMEOUT on the second attempt and keeps 429 until 3", () => {
    expect(shouldMarkJobDead("TIMEOUT", 1)).toBe(false);
    expect(shouldMarkJobDead("TIMEOUT", 2)).toBe(true);
    expect(shouldMarkJobDead("HTTP_429", 2)).toBe(false);
    expect(shouldMarkJobDead("HTTP_429", 3)).toBe(true);
    expect(shouldMarkJobDead("HTTP_401", 1)).toBe(true);
  });

  it("chunks around 1000 characters", () => {
    const text = "a".repeat(2500);
    const chunks = chunkText(text);
    expect(chunks[0]?.content.length).toBe(aiChunkChars());
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps 0.75 as the default distance limit", () => {
    expect(retrievalDistanceLimit()).toBe(0.75);
    expect(confidenceBand([0.772])).toBe("insuficiente");
    process.env.AI_RETRIEVAL_DISTANCE_LIMIT = "0.85";
    expect(confidenceBand([0.772])).toBe("baixa");
  });

  it("keeps the JSON-invalid copy out of the evidence sentence", () => {
    expect(analiseInterrompidaTexto("json_invalido")).toContain("rejeitada na validação");
    expect(analiseInterrompidaTexto("json_invalido")).not.toContain("evidências suficientes");
    expect(analiseInterrompidaTexto("insuficiente")).toContain("evidências suficientes");
  });
});
