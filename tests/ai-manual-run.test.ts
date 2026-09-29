import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { buildAnalysisFluxo } from "@/lib/ai/analysis-snapshot";
import { enqueueManualInbound, jobKeysNeedLatestInbound, payloadMessageIds } from "@/lib/ai/enqueue";
import { loadInboundForJobs, loadSelectedMessages, selectedIdsForJobs } from "@/lib/ai/inbound-messages";
import { startManualAiRun } from "@/lib/ai/manual-run";
import { buildModelPackage, MESSAGE_DATA_CHAR_LIMIT, packageMessages } from "@/lib/ai/package";

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

  it("mensagens marcadas gravam messageIds no payload do job", async () => {
    process.env.AI_ENABLED = "true";
    const created: Array<{ payload?: unknown }> = [];
    const counts: Array<{ where: Record<string, unknown> }> = [];
    const db = {
      message: {
        count: async (args: { where: Record<string, unknown> }) => {
          counts.push(args);
          return 2;
        },
      },
      aiJob: {
        create: async (args: { data: { payload?: unknown } }) => {
          created.push(args.data);
          return { id: "j" };
        },
      },
    };
    await startManualAiRun(db as never, {
      conversationId: "c1",
      condominiumId: "condo",
      messageIds: [ID_IN, ID_OUT],
    });
    expect(counts[0]?.where).toEqual({ conversationId: "c1", id: { in: [ID_IN, ID_OUT] } });
    expect(created[0]?.payload).toEqual({ messageIds: [ID_IN, ID_OUT] });
  });

  it("id de outra conversa responde 422 e não enfileira", async () => {
    process.env.AI_ENABLED = "true";
    let queued = 0;
    const db = {
      message: { count: async () => 1 },
      aiJob: {
        create: async () => {
          queued += 1;
          return { id: "j" };
        },
      },
    };
    await expect(
      startManualAiRun(db as never, { conversationId: "c1", condominiumId: "condo", messageIds: [ID_IN, ID_OUTRA] }),
    ).rejects.toMatchObject({ status: 422, message: "Mensagem marcada não pertence a esta conversa" });
    expect(queued).toBe(0);
  });

  it("lista vazia, id inválido ou mais de 40 respondem 422", async () => {
    process.env.AI_ENABLED = "true";
    const db = {
      message: { count: async () => 0 },
      aiJob: { create: async () => ({ id: "j" }) },
    };
    const base = { conversationId: "c1", condominiumId: "condo" };
    await expect(startManualAiRun(db as never, { ...base, messageIds: [] })).rejects.toMatchObject({ status: 422 });
    await expect(startManualAiRun(db as never, { ...base, messageIds: ["nao-uuid"] })).rejects.toMatchObject({ status: 422 });
    const many = Array.from({ length: 41 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
    await expect(startManualAiRun(db as never, { ...base, messageIds: many })).rejects.toMatchObject({ status: 422 });
  });

  it("job com messageIds busca por id na conversa, sem filtro de direção", async () => {
    const calls: Array<{ where: Record<string, unknown>; take?: number }> = [];
    const messages = {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        calls.push(args);
        return [
          { id: ID_IN, body: "é esse ?", direction: "in" as const },
          { id: ID_OUT, body: "pode mandar", direction: "out" as const },
        ];
      },
    };
    const ids = selectedIdsForJobs([{ payload: null }, { payload: { messageIds: [ID_IN, ID_OUT] } }]);
    expect(ids).toEqual([ID_IN, ID_OUT]);
    const rows = await loadSelectedMessages(messages, "conv", ids!);
    expect(calls[0]?.where).toEqual({ conversationId: "conv", id: { in: [ID_IN, ID_OUT] } });
    expect(calls[0]?.where).not.toHaveProperty("direction");
    expect(calls[0]?.take).toBeUndefined();
    expect(rows.map((row) => row.body)).toEqual(["cliente: é esse ?", "escritório: pode mandar"]);
  });

  it("job sem payload continua nas últimas 20 recebidas", async () => {
    expect(selectedIdsForJobs([{ payload: null }, { payload: undefined }])).toBeNull();
    expect(payloadMessageIds({ messageIds: [] })).toBeNull();
    const calls: Array<{ where: Record<string, unknown>; take?: number }> = [];
    const messages = {
      findMany: async (args: { where: Record<string, unknown>; take?: number; orderBy: { createdAt: string } }) => {
        calls.push(args);
        return [];
      },
    };
    await loadInboundForJobs(messages, "conv", ["manual:conv:1"]);
    expect(calls[0]?.where).toEqual({ conversationId: "conv", direction: "in" });
    expect(calls[0]?.take).toBe(20);
  });

  it("pacote da seleção leva até 40 mensagens, mas para em 8000 caracteres descartando as antigas", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ body: `${String(i).padStart(2, "0")} ${"x".repeat(600)}` }));
    const kept = packageMessages(rows, 40);
    const size = kept.reduce((sum, body) => sum + body.length + 3, 0);
    expect(size).toBeLessThanOrEqual(MESSAGE_DATA_CHAR_LIMIT);
    expect(kept[kept.length - 1]?.startsWith("39 ")).toBe(true);
    expect(kept.length).toBeLessThan(40);
    const packed = buildModelPackage({
      system: "s",
      model: "m",
      condominiumName: "Alpha",
      city: null,
      memorySummary: null,
      messages: rows,
      messageLimit: 40,
      chunks: [{ id: "chunk-a", content: "regra da obra" }],
    });
    expect(packed.user).toContain("id=chunk-a regra da obra");
    expect(packed.user.indexOf("<DOCUMENT_DATA>")).toBeGreaterThan(packed.user.indexOf("</MESSAGE_DATA>"));
  });

  it("pacote sem seleção continua com 12 mensagens", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ body: `m${i}` }));
    expect(packageMessages(rows)).toHaveLength(12);
    expect(packageMessages(rows)[0]).toBe("m8");
  });

  it("mensagensAnalisadas usa a contagem do pacote na seleção", () => {
    const base = {
      condominioNome: "Alpha",
      condominioIdentificado: true,
      mensagem: null,
      mensagensCarregadas: 30,
      memorySummary: null,
      memoryVersion: null,
      memoryCreatedAt: null,
      contactFacts: [],
      documentosPorIngestao: null,
      ragMotivo: "concluido" as const,
      chunks: [],
      citedCount: 0,
      llm: "ok" as const,
      validacao: "ok" as const,
      citations: "ok" as const,
      conversaOk: true,
    };
    expect(buildAnalysisFluxo(base).mensagensAnalisadas).toBe(12);
    expect(buildAnalysisFluxo({ ...base, mensagensNoPacote: 25 }).mensagensAnalisadas).toBe(25);
  });
});

const ID_IN = "11111111-1111-4111-8111-111111111111";
const ID_OUT = "22222222-2222-4222-8222-222222222222";
const ID_OUTRA = "33333333-3333-4333-8333-333333333333";
