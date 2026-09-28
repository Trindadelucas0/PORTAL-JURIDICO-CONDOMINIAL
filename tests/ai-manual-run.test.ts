import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { enqueueManualInbound, jobKeysNeedLatestInbound } from "@/lib/ai/enqueue";
import { loadInboundForJobs } from "@/lib/ai/inbound-messages";
import { startManualAiRun } from "@/lib/ai/manual-run";

describe("disparo manual da IA", () => {
  it("chave manual não é UUID de mensagem", () => {
    expect(jobKeysNeedLatestInbound([`manual:c1:${Date.now()}`])).toBe(true);
    expect(jobKeysNeedLatestInbound(["11111111-1111-4111-8111-111111111111"])).toBe(false);
  });

  it("enqueueManualInbound grava duas chaves diferentes", async () => {
    const prev = process.env.AI_ENABLED;
    process.env.AI_ENABLED = "true";
    const keys: string[] = [];
    const db = {
      aiJob: {
        create: async (args: { data: { idempotencyKey: string; type: string; runAfter: Date } }) => {
          keys.push(args.data.idempotencyKey);
          expect(args.data.type).toBe("ai.inbound");
          expect(args.data.idempotencyKey.startsWith("manual:c1:")).toBe(true);
          return { id: keys.length };
        },
      },
    };
    const first = await enqueueManualInbound(db as never, "c1");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await enqueueManualInbound(db as never, "c1");
    expect(first.queued).toBe(true);
    expect(second.queued).toBe(true);
    expect(keys[0]).not.toBe(keys[1]);
    if (prev) process.env.AI_ENABLED = prev;
    else delete process.env.AI_ENABLED;
  });

  it("job manual lê as últimas inbound", async () => {
    const calls: Array<{ where: Record<string, unknown>; take?: number }> = [];
    const messages = {
      findMany: async (args: { where: Record<string, unknown>; take?: number; orderBy: { createdAt: string } }) => {
        calls.push(args);
        return [
          { id: "b", body: "dois" },
          { id: "a", body: "um" },
        ];
      },
    };
    const rows = await loadInboundForJobs(messages, "conv", ["manual:conv:1"]);
    expect(calls[0]?.where).toEqual({ conversationId: "conv", direction: "in" });
    expect(calls[0]?.take).toBe(20);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("sem condomínio responde 422", async () => {
    process.env.AI_ENABLED = "true";
    const db = {
      message: { count: async () => 1 },
      aiJob: { create: async () => ({ id: "j" }) },
    };
    await expect(startManualAiRun(db as never, { conversationId: "c1", condominiumId: null })).rejects.toMatchObject({
      status: 422,
    });
    await expect(startManualAiRun(db as never, { conversationId: "c1", condominiumId: null })).rejects.toBeInstanceOf(AppError);
  });

  it("sem mensagem inbound responde 422", async () => {
    process.env.AI_ENABLED = "true";
    const db = {
      message: { count: async () => 0 },
      aiJob: { create: async () => ({ id: "j" }) },
    };
    await expect(
      startManualAiRun(db as never, { conversationId: "c1", condominiumId: "condo" }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
