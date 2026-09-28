import { describe, expect, it } from "vitest";
import type { PrismaClient, User } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { buildAnalysisFluxo } from "@/lib/ai/analysis-snapshot";
import { sendCopilotDraft, updateCopilotDraft } from "@/lib/ai/copilot-draft";
import { FALLBACK_HUMAN_REVIEW } from "@/lib/ai/prompts/inbound-v2";

const ingestao = { stored: 1, pending_index: 0, indexed: 2, skipped: 3 };

describe("buildAnalysisFluxo", () => {
  it("grava modelo_nao_citou quando há chunk e nenhuma citation", () => {
    const fluxo = buildAnalysisFluxo({
      condominioNome: "Parque",
      condominioIdentificado: true,
      mensagem: { body: "Posso fazer obra?", createdAt: "2026-09-26T09:00:00.000Z", remetente: "Ana", canal: "WhatsApp" },
      mensagensCarregadas: 20,
      memorySummary: "Unidade em reforma.",
      memoryVersion: 2,
      memoryCreatedAt: "2026-09-25T12:00:00.000Z",
      contactFacts: [],
      documentosPorIngestao: ingestao,
      ragMotivo: "concluido",
      chunks: [
        { documentId: "d1", title: "Regimento interno" },
        { documentId: "d1", title: "Regimento interno" },
        { documentId: "d2", title: "" },
      ],
      citedCount: 0,
      llm: "ok",
      validacao: "ok",
      citations: "ok",
      conversaOk: true,
    });
    expect(fluxo.documentosMotivo).toBe("modelo_nao_citou");
    expect(fluxo.mensagensAnalisadas).toBe(12);
    expect(fluxo.documentosRecuperados).toBe(2);
    expect(fluxo.recuperados).toEqual([{ titulo: "Regimento interno" }]);
    expect(fluxo.documentosDisponiveis).toBe(6);
    expect(fluxo.memoria?.resumo).toBe("Unidade em reforma.");
    expect(fluxo.memoria?.versaoOrigem).toBe(2);
    expect(fluxo.execucao.rag).toBe("ok");
  });

  it("não marca motivo de documento quando a citation existe", () => {
    const fluxo = buildAnalysisFluxo({
      condominioNome: "Parque",
      condominioIdentificado: true,
      mensagem: null,
      mensagensCarregadas: 1,
      memorySummary: null,
      memoryVersion: null,
      memoryCreatedAt: null,
      contactFacts: [],
      documentosPorIngestao: ingestao,
      ragMotivo: "concluido",
      chunks: [{ documentId: "d1", title: "Regimento interno" }],
      citedCount: 1,
      llm: "ok",
      validacao: "ok",
      citations: "ok",
      conversaOk: true,
    });
    expect(fluxo.documentosMotivo).toBeNull();
    expect(fluxo.memoria).toBeNull();
  });

  it("RAG desligado fica falhou e o motivo permanece o do retriever", () => {
    const fluxo = buildAnalysisFluxo({
      condominioNome: "Parque",
      condominioIdentificado: true,
      mensagem: null,
      mensagensCarregadas: 0,
      memorySummary: null,
      memoryVersion: null,
      memoryCreatedAt: null,
      contactFacts: [],
      documentosPorIngestao: { stored: 0, pending_index: 0, indexed: 0, skipped: 4 },
      ragMotivo: "rag_desligado",
      chunks: [],
      citedCount: 0,
      llm: "falhou",
      validacao: "ok",
      citations: "falhou",
      conversaOk: true,
    });
    expect(fluxo.documentosMotivo).toBe("rag_desligado");
    expect(fluxo.execucao.rag).toBe("falhou");
    expect(fluxo.chunksRecuperados).toBe(0);
  });
});

function user(partial: Partial<User>): User {
  return {
    id: "u1",
    role: "funcionario",
    podeResponderCliente: true,
    apenasRascunho: false,
    ativo: true,
    ...partial,
  } as User;
}

function revisionDb(found: boolean) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const revision = found
    ? {
        id: "rev1",
        conversationId: "c1",
        ticketId: "t1",
        version: 2,
        summaryJson: {
          analise: "interpretação interna que não vai ao cliente",
          respostaSugerida: "Olá, conforme o regimento.",
        },
        interaction: { id: "int1", draftMessage: null },
      }
    : null;
  const db = {
    aiTicketMemoryRevision: {
      findFirst: async ({ where }: { where: { conversationId: string; version: number } }) => {
        if (!revision) return null;
        if (where.conversationId !== "c1" || where.version !== 2) return null;
        return revision;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updated.push(data);
        return data;
      },
    },
    message: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "new-msg", ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updated.push({ message: data });
        return data;
      },
    },
    aiInteraction: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updated.push({ interaction: data });
        return data;
      },
    },
  };
  return { db: db as unknown as PrismaClient, created, updated };
}

describe("copilot draft", () => {
  it("PATCH grava o texto e não envia", async () => {
    const { db, created, updated } = revisionDb(true);
    const approved: string[] = [];
    const result = await updateCopilotDraft(db, "c1", 2, "Texto editado.");
    expect(result.texto).toBe("Texto editado.");
    expect(created).toEqual([]);
    expect(approved).toEqual([]);
    expect(updated[0]).toMatchObject({ summaryJson: { respostaSugerida: "Texto editado." } });
    const summary = (updated[0] as { summaryJson: { analise: string } }).summaryJson;
    expect(summary.analise).toBe("interpretação interna que não vai ao cliente");
  });

  it("POST envia só o clientDraft e recusa apenasRascunho", async () => {
    const bag = revisionDb(true);
    const approved: string[] = [];
    await expect(sendCopilotDraft(bag.db, user({ apenasRascunho: true }), "c1", 2, async () => null)).rejects.toBeInstanceOf(AppError);
    expect(bag.created).toEqual([]);
    const sent = await sendCopilotDraft(bag.db, user({}), "c1", 2, async (_actor, messageId) => {
      approved.push(messageId);
      return { id: messageId };
    });
    expect(sent).toEqual({ id: "new-msg" });
    expect(bag.created[0]).toMatchObject({
      body: "Olá, conforme o regimento.",
      visibility: "publica",
      direction: "out",
      sendStatus: "draft",
    });
    expect(bag.created[0]?.body).not.toBe("interpretação interna que não vai ao cliente");
    expect(approved).toEqual(["new-msg"]);
  });

  it("POST recusa a frase de revisão humana e não chama approve", async () => {
    const bag = revisionDb(true);
    const revision = await bag.db.aiTicketMemoryRevision.findFirst({ where: { conversationId: "c1", version: 2 } });
    if (revision) {
      (revision.summaryJson as { respostaSugerida: string }).respostaSugerida = FALLBACK_HUMAN_REVIEW;
    }
    const approved: string[] = [];
    await expect(
      sendCopilotDraft(bag.db, user({}), "c1", 2, async () => {
        approved.push("sent");
        return null;
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(bag.created).toEqual([]);
    expect(approved).toEqual([]);
  });

  it("POST recusa análise reformulada e não cria mensagem", async () => {
    const bag = revisionDb(true);
    const revision = await bag.db.aiTicketMemoryRevision.findFirst({ where: { conversationId: "c1", version: 2 } });
    if (revision) {
      (revision.summaryJson as { respostaSugerida: string }).respostaSugerida =
        "O modelo identificou que precisamos revisar internamente o caso antes de responder.";
    }
    const approved: string[] = [];
    await expect(
      sendCopilotDraft(bag.db, user({}), "c1", 2, async () => {
        approved.push("sent");
        return null;
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(bag.created).toEqual([]);
    expect(approved).toEqual([]);
  });

  it("versão de outra conversa responde 404", async () => {
    const { db } = revisionDb(true);
    await expect(updateCopilotDraft(db, "outra", 2, "texto")).rejects.toMatchObject({ status: 404 });
  });
});
