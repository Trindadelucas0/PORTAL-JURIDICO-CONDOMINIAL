import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiJob: { count: async () => 0 },
    aiInteraction: { aggregate: async () => ({ _sum: { inputTokens: 0, outputTokens: 0 } }) },
    aiAuditEvent: { groupBy: async () => [] },
  },
}));

import { GET } from "@/app/api/metrics/route";

describe("GET /api/metrics", () => {
  const prev = process.env.METRICS_TOKEN;

  beforeEach(() => {
    delete process.env.METRICS_TOKEN;
  });

  afterEach(() => {
    if (prev) process.env.METRICS_TOKEN = prev;
    else delete process.env.METRICS_TOKEN;
  });

  it("returns 404 when METRICS_TOKEN is empty", async () => {
    const res = await GET(new Request("http://localhost/api/metrics"));
    expect(res.status).toBe(404);
  });

  it("returns prometheus text with bearer token", async () => {
    process.env.METRICS_TOKEN = "metrics-token-value";
    const res = await GET(
      new Request("http://localhost/api/metrics", { headers: { authorization: "Bearer metrics-token-value" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("juricon_ai_jobs_queued");
    expect(text).toContain("juricon_ai_tokens_today");
    expect(text).toContain("juricon_ai_circuit_open");
  });
});
