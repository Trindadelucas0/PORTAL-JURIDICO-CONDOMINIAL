import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

const requireAdmin = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn(async () => 4));
const aggregate = vi.hoisted(() => vi.fn(async () => ({ _sum: { inputTokens: 2, outputTokens: 3 } })));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiJob: { count },
    aiInteraction: { aggregate },
  },
}));

import { GET } from "@/app/api/health/ai/route";

describe("GET /api/health/ai", () => {
  it("returns 403 for funcionario", async () => {
    requireAdmin.mockRejectedValue(new AppError(403, "FORBIDDEN", "Acesso restrito a administradores"));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the queued count for admin", async () => {
    const prev = process.env.AI_ENABLED;
    delete process.env.AI_ENABLED;
    requireAdmin.mockResolvedValue({ id: "admin", role: "admin" });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { queued: number; running: number; failed24h: number; tokensToday: number; circuitOpen: boolean; flags: { aiEnabled: boolean } };
    };
    expect(json.data.queued).toBe(4);
    expect(json.data.running).toBe(4);
    expect(json.data.tokensToday).toBe(5);
    expect(json.data.circuitOpen).toBe(false);
    expect(json.data.flags.aiEnabled).toBe(false);
    if (prev) process.env.AI_ENABLED = prev;
  });
});
