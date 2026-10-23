import { describe, expect, it } from "vitest";
import { isMessageUuid } from "@/lib/ai/enqueue";
import {
  IMAGE_HANDOFF_TEXT,
  INTAKE_NUDGE_TEXT,
  INTAKE_QUESTION_CAP,
  INTAKE_WAIT_MS_DEFAULT,
  UNCLEAR_ESCALATE_TEXT,
  UNCLEAR_REPEAT_TEXT,
  categoriaChamadoUnclear,
  coagirAskSemDecision,
  comSaudacao,
  decidir,
  decidirChamadoUnclear,
  decidirInterrupcao,
  decidirTimeout,
  imagemNoMeio,
  inboundKeysToShift,
  intakeTimeoutKey,
  intakeWaitMs,
  patchTriagemAberta,
  prioridadeAposImagem,
  saudacaoPorMinuto,
  sessionCountsForTurn,
  type DecidirInput,
} from "@/lib/ai/intake-cycle";
import type { PrismaClient } from "@prisma/client";
import { isAiWhatsappSendEnabled } from "@/lib/ai/flags";
import { runIntakeTimeoutJob } from "@/lib/ai/intake-runtime";
import { modelOutputSchema } from "@/lib/ai/output";
import { buildModelPackage } from "@/lib/ai/package";
import { INBOUND_DEBOUNCE_MS, inboundDebounceMs } from "@/lib/ai/queue";
import { chunksVisibleToConversation } from "@/lib/ai/retriever";

const summary = {
  contexto: "c",
  problema: "p",
  documentos: "d",
  analise: "a",
  pendencias: "",
  proximaAcao: "n",
};

function base(over: Partial<DecidirInput> = {}): DecidirInput {
  return {
    manual: false,
    hasCondominium: true,
    sessionStatus: null,
    questionCount: 0,
    unclearCount: 0,
    modelDecision: "ASK",
    question: "Em que horário acontece?",
    answer: null,
    publicReplyStatus: "ok",
    riskHigh: false,
    injection: false,
    jsonInvalid: false,
    greetingSentThisInbound: false,
    humanPublicAfterBatchStart: false,
    ...over,
  };
}

describe("coleta decidir", () => {
  it("inicia a coleta com ASK e não grava a pergunta como rascunho", () => {
    const plan = decidir(base());
    expect(plan.kind).toBe("ask");
    expect(plan.sendWhatsapp).toBe(true);
    expect(plan.startSession).toBe(true);
    expect(plan.incrementQuestion).toBe(true);
    expect(plan.suppressDraft).toBe(true);
    expect(plan.nextStatus).toBe("waiting_client");
  });

  it("encerra cedo quando o modelo completa antes do teto", () => {
    const plan = decidir(base({ modelDecision: "COMPLETE", questionCount: 1, question: null, answer: null }));
    expect(plan.kind).toBe("complete");
    expect(plan.sendWhatsapp).toBe(false);
    expect(plan.nextStatus).toBe("ready_for_human");
    expect(plan.suppressDraft).toBe(false);
  });

  it("frase aprovada sem decision sai no WhatsApp e não conta pergunta", () => {
    const plan = decidir(
      base({
        modelDecision: null,
        question: null,
        answer: "O salão de festas do condomínio Exito pode ser utilizado das 9h às 23h.",
      }),
    );
    expect(plan.kind).toBe("answer");
    expect(plan.sendWhatsapp).toBe(true);
    expect(plan.incrementQuestion).toBe(false);
    expect(plan.suppressDraft).toBe(true);
    expect(plan.nextStatus).toBe("waiting_client");
    expect(plan.text).toContain("9h às 23h");
  });

  it("COMPLETE com frase ok também envia", () => {
    const plan = decidir(
      base({
        modelDecision: "COMPLETE",
        question: null,
        answer: "O salão de festas do condomínio Exito pode ser utilizado das 9h às 23h.",
      }),
    );
    expect(plan.kind).toBe("answer");
    expect(plan.sendWhatsapp).toBe(true);
    expect(plan.incrementQuestion).toBe(false);
  });

  it("reprovar, job manual, risco alto e mensagem humana no lote não enviam a frase", () => {
    const frase = "O salão de festas do condomínio Exito pode ser utilizado das 9h às 23h.";
    expect(
      decidir(base({ modelDecision: null, question: null, answer: frase, publicReplyStatus: "reprovar" })).sendWhatsapp,
    ).toBe(false);
    expect(decidir(base({ manual: true, modelDecision: null, question: null, answer: frase })).sendWhatsapp).toBe(false);
    expect(decidir(base({ riskHigh: true, modelDecision: null, question: null, answer: frase })).sendWhatsapp).toBe(false);
    expect(
      decidir(base({ humanPublicAfterBatchStart: true, modelDecision: null, question: null, answer: frase })).sendWhatsapp,
    ).toBe(false);
  });

  it("permite a quarta pergunta e bloqueia a quinta", () => {
    const fourth = decidir(base({ questionCount: INTAKE_QUESTION_CAP - 1 }));
    expect(fourth.kind).toBe("ask");
    expect(fourth.sendWhatsapp).toBe(true);

    const fifth = decidir(base({ questionCount: INTAKE_QUESTION_CAP }));
    expect(fifth.kind).toBe("human_review");
    expect(fifth.sendWhatsapp).toBe(false);
    expect(fifth.suppressDraft).toBe(true);

    const cappedComplete = decidir(base({ modelDecision: "COMPLETE", questionCount: INTAKE_QUESTION_CAP, question: null }));
    expect(cappedComplete.kind).toBe("complete");
    expect(cappedComplete.sendWhatsapp).toBe(false);
  });

  it("não pergunta em job manual, sem condomínio, sessão interrompida ou resposta humana", () => {
    expect(decidir(base({ manual: true })).sendWhatsapp).toBe(false);
    expect(decidir(base({ hasCondominium: false })).kind).toBe("skip");
    expect(decidir(base({ sessionStatus: "interrupted" })).kind).toBe("skip");
    expect(decidir(base({ sessionStatus: "interrupted" })).sendWhatsapp).toBe(false);
    expect(decidir(base({ humanPublicAfterBatchStart: true })).sendWhatsapp).toBe(false);
    expect(
      decidir(base({ humanPublicAfterBatchStart: true, modelDecision: "UNCLEAR", question: null })).sendWhatsapp,
    ).toBe(false);
  });

  it("saudação no mesmo inbound não bloqueia ASK", () => {
    const plan = decidir(base({ greetingSentThisInbound: true }));
    expect(plan.kind).toBe("ask");
    expect(plan.sendWhatsapp).toBe(true);
    const unclear = decidir(base({ greetingSentThisInbound: true, modelDecision: "UNCLEAR", question: null }));
    expect(unclear.kind).toBe("unclear_repeat");
    expect(unclear.sendWhatsapp).toBe(true);
  });

  it("rascunho com uma pergunta e sem decision vira ASK", () => {
    const coerced = coagirAskSemDecision({
      modelDecision: null,
      clientDraft: "Em que horário acontece?",
      question: null,
      mensagemCliente: "o vizinho faz barulho",
    });
    expect(coerced.modelDecision).toBe("ASK");
    expect(coerced.question).toBe("Em que horário acontece?");
    const plan = decidir(base({ modelDecision: coerced.modelDecision, question: coerced.question }));
    expect(plan.kind).toBe("ask");
    expect(plan.sendWhatsapp).toBe(true);
    expect(
      coagirAskSemDecision({
        modelDecision: "COMPLETE",
        clientDraft: "Em que horário acontece?",
        question: null,
        mensagemCliente: "oi",
      }).modelDecision,
    ).toBe("COMPLETE");
    expect(decidir(base({ modelDecision: "COMPLETE", question: null, answer: null })).sendWhatsapp).toBe(false);
    expect(decidir(base({ riskHigh: true })).sendWhatsapp).toBe(false);
    expect(decidir(base({ jsonInvalid: true, modelDecision: null, question: null })).sendWhatsapp).toBe(false);
  });

  it("categoria da triagem aberta atualiza sem criar chamado", () => {
    expect(patchTriagemAberta({ status: "aberto", category: "obras", priority: "media" })).toEqual({
      category: "obras",
      priority: "media",
    });
    expect(patchTriagemAberta({ status: "promovido", category: "obras", priority: "alta" })).toBeNull();
    expect(patchTriagemAberta({ status: "aberto" })).toBeNull();
    expect(categoriaChamadoUnclear("assembleia")).toBe("assembleia");
    expect(categoriaChamadoUnclear(null)).toBe("outro");
    expect(categoriaChamadoUnclear("")).toBe("outro");
  });

  it("risco alto, injeção e JSON inválido vão para revisão humana sem WhatsApp", () => {
    for (const flag of ["riskHigh", "injection", "jsonInvalid"] as const) {
      const plan = decidir(base({ [flag]: true }));
      expect(plan.kind).toBe("human_review");
      expect(plan.sendWhatsapp).toBe(false);
    }
  });

  it("ASK só sai se a resposta pública está ok", () => {
    const blocked = decidir(base({ publicReplyStatus: "reprovar" }));
    expect(blocked.kind).toBe("human_review");
    expect(blocked.sendWhatsapp).toBe(false);
  });

  it("UNCLEAR pede repetição sem consumir questionCount e na segunda escala", () => {
    const first = decidir(base({ modelDecision: "UNCLEAR", question: null, questionCount: 3 }));
    expect(first.kind).toBe("unclear_repeat");
    expect(first.text).toBe(UNCLEAR_REPEAT_TEXT);
    expect(first.incrementQuestion).toBe(false);
    expect(first.sendWhatsapp).toBe(true);

    const second = decidir(base({ modelDecision: "UNCLEAR", question: null, unclearCount: 1, questionCount: 4 }));
    expect(second.kind).toBe("unclear_escalate");
    expect(second.text).toBe(UNCLEAR_ESCALATE_TEXT);
    expect(second.incrementQuestion).toBe(false);
    expect(second.nextStatus).toBe("human_review");
  });
});

describe("chamado da segunda UNCLEAR", () => {
  it("nunca cria chamado: sobe prioridade do chamado aberto ou da triagem, e não duplica alta ou urgente", () => {
    expect(
      decidirChamadoUnclear({
        hasAdmin: true,
        triageOpen: true,
        contactHasCondominium: true,
        openTicket: null,
      }),
    ).toEqual({ sendPhrase: true, action: "raise_triage" });

    expect(
      decidirChamadoUnclear({
        hasAdmin: true,
        triageOpen: true,
        contactHasCondominium: true,
        openTicket: { priority: "media" },
      }).action,
    ).toBe("raise");

    expect(
      decidirChamadoUnclear({
        hasAdmin: true,
        triageOpen: false,
        contactHasCondominium: true,
        openTicket: { priority: "baixa" },
      }).action,
    ).toBe("raise");

    expect(
      decidirChamadoUnclear({
        hasAdmin: true,
        triageOpen: true,
        contactHasCondominium: true,
        openTicket: { priority: "alta" },
      }),
    ).toEqual({ sendPhrase: true, action: "keep" });

    expect(
      decidirChamadoUnclear({
        hasAdmin: true,
        triageOpen: true,
        contactHasCondominium: true,
        openTicket: { priority: "urgente" },
      }).action,
    ).toBe("keep");
  });

  it("sem admin não manda a frase", () => {
    expect(
      decidirChamadoUnclear({
        hasAdmin: false,
        triageOpen: true,
        contactHasCondominium: true,
        openTicket: null,
      }),
    ).toEqual({ sendPhrase: false, action: "none" });
  });
});

describe("debounce, timeout e interrupção", () => {
  it("move o debounce só de chave UUID", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(isMessageUuid(uuid)).toBe(true);
    expect(isMessageUuid("manual:c:1")).toBe(false);
    expect(inboundKeysToShift(["manual:c:1", uuid, "intake-timeout:s:1"], isMessageUuid)).toEqual([uuid]);
    expect(inboundDebounceMs({})).toBe(INBOUND_DEBOUNCE_MS);
    expect(inboundDebounceMs({ AI_INBOUND_DEBOUNCE_MS: "9000" })).toBe(9000);
    expect(inboundDebounceMs({ AI_INBOUND_DEBOUNCE_MS: "nope" })).toBe(INBOUND_DEBOUNCE_MS);
  });

  it("timeout manda um lembrete e não repete", () => {
    expect(intakeWaitMs({})).toBe(INTAKE_WAIT_MS_DEFAULT);
    expect(intakeTimeoutKey("sess", 2)).toBe("intake-timeout:sess:2");
    const first = decidirTimeout({
      inboundAfterQuestion: false,
      nudgeSent: false,
      questionCount: 2,
      sessionWaiting: true,
    });
    expect(first.sendNudge).toBe(true);
    expect(INTAKE_NUDGE_TEXT).toContain("pergunta anterior");
    const again = decidirTimeout({
      inboundAfterQuestion: false,
      nudgeSent: true,
      questionCount: 2,
      sessionWaiting: true,
    });
    expect(again.sendNudge).toBe(false);
    expect(
      decidirTimeout({
        inboundAfterQuestion: true,
        nudgeSent: false,
        questionCount: 2,
        sessionWaiting: true,
      }).sendNudge,
    ).toBe(false);
  });

  it("interrupção só vale com sessão aberta", () => {
    expect(decidirInterrupcao("waiting_client")).toEqual({ allowed: true, next: "interrupted" });
    expect(decidirInterrupcao("collecting").allowed).toBe(true);
    expect(decidirInterrupcao("processing").allowed).toBe(true);
    expect(decidirInterrupcao("ready_for_human").allowed).toBe(false);
    expect(decidirInterrupcao("completed").allowed).toBe(false);
    expect(decidirInterrupcao(null).allowed).toBe(false);
  });
});

describe("contrato antigo e pacote", () => {
  it("decision continua opcional no JSON antigo", () => {
    const parsed = modelOutputSchema.parse({
      clientDraft: "Oi",
      summary,
      analysis: { intencao: "duvida", risco: "baixo", conflitos: [], motivoEscalonamento: null },
      abstain: false,
      citations: [],
    });
    expect(parsed.decision).toBeUndefined();
  });

  it("CURRENT_INTAKE_CONTEXT é opcional e MESSAGE_DATA guarda o cliente", () => {
    const packed = buildModelPackage({
      system: "s",
      model: "m",
      condominiumName: "Solar",
      city: null,
      memorySummary: null,
      messages: [{ body: "o cliente falou do barulho" }],
      chunks: [],
      intakeContext: {
        problema: "barulho",
        confirmado: ["noite"],
        falta: ["horário"],
        proximaAcao: "pedir o horário",
      },
    });
    expect(packed.user).toContain("<MESSAGE_DATA>");
    expect(packed.user).toContain("o cliente falou do barulho");
    expect(packed.user).toContain("<CURRENT_INTAKE_CONTEXT>");
    expect(packed.user.indexOf("<MESSAGE_DATA>")).toBeLessThan(packed.user.indexOf("<CURRENT_INTAKE_CONTEXT>"));

    const plain = buildModelPackage({
      system: "s",
      model: "m",
      condominiumName: "Solar",
      city: null,
      memorySummary: null,
      messages: [{ body: "oi" }],
      chunks: [],
    });
    expect(plain.user).not.toContain("CURRENT_INTAKE_CONTEXT");
  });
});

describe("coleta depois do chamado e cumprimento", () => {
  const ticketAt = new Date("2026-10-08T17:09:19.000Z");

  it("sessão interrompida de chamado anterior não conta no chamado reaberto", () => {
    const reset = sessionCountsForTurn({
      session: {
        status: "interrupted",
        questionCount: 2,
        unclearCount: 1,
        startedAt: new Date("2026-10-08T12:00:00.000Z"),
      },
      openTicketCreatedAt: ticketAt,
    });
    expect(reset).toEqual({ sessionStatus: null, questionCount: 0, unclearCount: 0 });
  });

  it("interromper neste chamado continua pulando a coleta", () => {
    const kept = sessionCountsForTurn({
      session: {
        status: "interrupted",
        questionCount: 1,
        unclearCount: 0,
        startedAt: new Date("2026-10-08T17:10:00.000Z"),
      },
      openTicketCreatedAt: ticketAt,
    });
    expect(kept.sessionStatus).toBe("interrupted");
    expect(kept.questionCount).toBe(1);
  });

  it("sessão aberta mantém a contagem", () => {
    const open = sessionCountsForTurn({
      session: {
        status: "waiting_client",
        questionCount: 1,
        unclearCount: 0,
        startedAt: new Date("2026-10-08T17:08:00.000Z"),
      },
      openTicketCreatedAt: ticketAt,
    });
    expect(open).toEqual({ sessionStatus: "waiting_client", questionCount: 1, unclearCount: 0 });
  });

  it("14:00 é boa tarde e só a primeira frase leva o cumprimento", () => {
    expect(saudacaoPorMinuto(14 * 60)).toBe("Boa tarde");
    expect(saudacaoPorMinuto(5 * 60)).toBe("Bom dia");
    expect(saudacaoPorMinuto(18 * 60)).toBe("Boa noite");
    expect(comSaudacao("Qual o número do apartamento?", "Boa tarde", false)).toBe(
      "Boa tarde. Qual o número do apartamento?",
    );
    expect(comSaudacao("Qual o bloco?", "Boa tarde", true)).toBe("Qual o bloco?");
  });

  it("foto no meio repassa; a primeira mensagem, pdf e urgente não mudam o combinado", () => {
    expect(imagemNoMeio({ temImagem: true, houveMensagemAntes: true })).toBe(true);
    expect(imagemNoMeio({ temImagem: true, houveMensagemAntes: false })).toBe(false);
    expect(imagemNoMeio({ temImagem: false, houveMensagemAntes: true })).toBe(false);
    expect(IMAGE_HANDOFF_TEXT).toBe("Recebi a sua foto e vou repassar para a equipe dar prioridade.");
    expect(prioridadeAposImagem("media")).toBe("raise");
    expect(prioridadeAposImagem("baixa")).toBe("raise");
    expect(prioridadeAposImagem("urgente")).toBe("keep");
    expect(prioridadeAposImagem("alta")).toBe("keep");
    expect(prioridadeAposImagem(null)).toBe("raise_triage");
  });
});

describe("chunks de outro condomínio", () => {
  it("fica de fora via chunksVisibleToConversation", () => {
    const mixed = [
      { id: "a", condominiumId: "A", corpus: "condominium", active: true, content: "do A" },
      { id: "b", condominiumId: "B", corpus: "condominium", active: true, content: "do B" },
      { id: "sys", condominiumId: null, corpus: "system", active: true, content: "regra" },
    ];
    expect(chunksVisibleToConversation(mixed, "A").map((row) => row.id)).toEqual(["a", "sys"]);
  });
});

describe("coleta não envia sem aprovação da admin (contrato v14, cláusula 16.1)", () => {
  function fakeDb(created: Record<string, unknown>[], audited: Record<string, unknown>[]) {
    return {
      aiIntakeSession: {
        findUnique: async () => ({
          id: "s1",
          conversationId: "conv1",
          status: "waiting_client",
          questionCount: 1,
          nudgeSent: false,
          unclearCount: 0,
          startedAt: new Date("2026-10-20T12:00:00Z"),
          lastQuestionMessageId: "m0",
          lastQuestionAt: new Date("2026-10-20T12:00:00Z"),
          contextJson: null,
        }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({}),
      },
      message: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "m1" };
        },
        findUnique: async () => ({ sendStatus: "draft" }),
      },
      aiAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audited.push(data);
          return {};
        },
      },
      aiJob: { updateMany: async () => ({ count: 0 }) },
    } as unknown as PrismaClient;
  }

  it("o lembrete da coleta fica como rascunho público, não vai ao WhatsApp", async () => {
    const created: Record<string, unknown>[] = [];
    const audited: Record<string, unknown>[] = [];
    await runIntakeTimeoutJob(fakeDb(created, audited), {
      id: "job1",
      payload: { sessionId: "s1", questionCount: 1 },
      conversationId: "conv1",
    });

    expect(created).toHaveLength(1);
    expect(created[0].body).toBe(INTAKE_NUDGE_TEXT);
    expect(created[0].visibility).toBe("publica");
    expect(created[0].automated).toBe(true);
    // "draft" e nao "pending": quem despacha e approvalService.approve, que exige isAdmin.
    expect(created[0].sendStatus).toBe("draft");
    expect(audited.map((row) => row.action)).toContain("AI_INTAKE_NUDGE");
  });

  it("o interruptor de autoenvio continua desligado, e a env não o liga", () => {
    process.env.AI_WHATSAPP_SEND_ENABLED = "true";
    expect(isAiWhatsappSendEnabled()).toBe(false);
    delete process.env.AI_WHATSAPP_SEND_ENABLED;
    expect(isAiWhatsappSendEnabled()).toBe(false);
  });
});
