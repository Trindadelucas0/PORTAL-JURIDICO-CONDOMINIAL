import { describe, expect, it } from "vitest";
import { similarityPercent } from "@/lib/ai/confidence";
import { buildCopilotRevisionView, presentCopilotRevision, type CopilotRevisionView } from "@/lib/ai/copilot-view";

describe("similarityPercent", () => {
  it("deriva o percentual da distância de cosseno e recusa o que sairia do intervalo", () => {
    expect(similarityPercent(0.06)).toBe(94);
    expect(similarityPercent(0.75)).toBe(25);
    expect(similarityPercent(Number.NaN)).toBeNull();
    expect(similarityPercent(1.2)).toBeNull();
  });
});

describe("buildCopilotRevisionView", () => {
  const summaryJson = {
    contexto: "conversa",
    problema: "obra no sábado",
    documentos: "prosa que não pode virar fonte",
    analise: "ler o artigo",
    pendencias: "confirmar tipo",
    proximaAcao: "perguntar o horário",
    tecnica: {
      intencao: "obra",
      risco: "medio",
      conflitos: ["horário"],
      confianca: "alta",
      motivoEscalonamento: "",
      trechos: [
        { titulo: "Rascunho", pagina: 1, distancia: 0.5 },
        { titulo: "Título da segunda citação", pagina: 9, distancia: 0.1 },
        { titulo: "Não citado", pagina: 4, distancia: 0.2 },
      ],
    },
  };

  it("monta a fonte só com a citação recebida e o percentual da pior distância", () => {
    const view = buildCopilotRevisionView({
      version: 2,
      createdAt: "2026-09-25T13:42:00.000Z",
      status: "succeeded",
      summaryJson,
      citations: [
        {
          distance: 0.06,
          pageNumber: 8,
          documentTitle: "Regimento interno",
          storageKey: "docs/regimento.pdf",
          content: "Obras aos sábados até as 12h.",
        },
        {
          distance: 0.25,
          pageNumber: 3,
          documentTitle: null,
          storageKey: "  ",
          content: null,
        },
      ],
    });

    expect(view).not.toHaveProperty("documentos");
    expect(view.fontes).toHaveLength(2);
    expect(view.fontes[0]).toEqual({
      titulo: "Regimento interno",
      pagina: 8,
      distancia: 0.06,
      similaridade: 94,
      trecho: "Obras aos sábados até as 12h.",
      storageKey: "docs/regimento.pdf",
      tipo: null,
      versao: null,
      status: null,
      chunkId: null,
    });
    expect(view.medidas).toBeNull();
    expect(view.fontes[1]?.titulo).toBe("Documento sem título");
    expect(view.fontes[1]?.storageKey).toBeNull();
    expect(view.fontes[1]?.trecho).toBeNull();
    expect(view.fontes.some((fonte) => fonte.titulo === "Não citado")).toBe(false);
    expect(view.fontes.some((fonte) => fonte.titulo === "prosa que não pode virar fonte")).toBe(false);
    expect(view.fontes.some((fonte) => fonte.titulo === "Rascunho")).toBe(false);
    expect(view.contextoUtilizado.registrado).toBe(false);
    expect(view.tecnica.confiancaPercentual).toBe(75);
    expect(view.tecnica.motivoEscalonamento).toBeNull();
    expect(view.tecnica.confianca).toBe("alta");
  });

  it("sem citação não promove título gravado no JSON a fonte", () => {
    const view = buildCopilotRevisionView({
      version: 1,
      createdAt: new Date("2026-09-25T13:31:00.000Z"),
      status: "abstained",
      summaryJson,
      citations: [],
    });

    expect(view.fontes).toEqual([]);
    expect(view.createdAt).toBe("2026-09-25T13:31:00.000Z");
    expect(view.status).toBe("abstained");
    expect(view.contextoUtilizado.registrado).toBe(false);
    expect(view.resposta.registrado).toBe(false);
    expect(view.execucao.registrado).toBe(false);
  });

  it("lê o fluxo gravado e o rascunho sem transformar prosa em fonte", () => {
    const view = buildCopilotRevisionView({
      version: 3,
      createdAt: "2026-09-26T10:00:00.000Z",
      status: "succeeded",
      summaryJson: {
        ...summaryJson,
        documentos: "prosa que não pode virar fonte",
        respostaSugerida: "Olá, conforme o regimento.",
        fluxo: {
          mensagem: { body: "Posso fazer obra no sábado?", createdAt: "2026-09-26T09:00:00.000Z", remetente: "Ana", canal: "WhatsApp" },
          condominioNome: "Parque das Acácias",
          condominioIdentificado: true,
          mensagensAnalisadas: 1,
          memoriaUtilizada: 0,
          documentosDisponiveis: 2,
          documentosRecuperados: 1,
          chunksRecuperados: 1,
          ragMotivo: "concluido",
          documentosMotivo: null,
          documentosPorIngestao: { stored: 0, pending_index: 0, indexed: 2, skipped: 0, failed: 0 },
          recuperados: [{ titulo: "Regimento interno" }],
          memoria: null,
          execucao: {
            condominio: "ok",
            conversa: "ok",
            memoria: "ok",
            documentos: "ok",
            rag: "ok",
            llm: "ok",
            validacao: "ok",
            citations: "ok",
          },
        },
      },
      citations: [],
      draft: { id: "m1", body: "texto da mensagem", sendStatus: "draft" },
    });

    expect(view.fontes).toEqual([]);
    expect(view.mensagem?.body).toBe("Posso fazer obra no sábado?");
    expect(view.contextoUtilizado.registrado).toBe(true);
    expect(view.contextoUtilizado.ragMotivo).toBe("concluido");
    expect(view.resposta.texto).toBe("Olá, conforme o regimento.");
    expect(view.resposta.messageId).toBe("m1");
    expect(view.analise).toBe("ler o artigo");
    expect(view.resposta.texto).not.toBe(view.analise);
    expect(view.medidas).toBeNull();
  });

  it("liga a medida ao trecho da citação pelo chunkId e ignora chunk inventado", () => {
    const view = buildCopilotRevisionView({
      version: 4,
      createdAt: "2026-10-09T12:00:00.000Z",
      status: "succeeded",
      summaryJson: {
        ...summaryJson,
        medidas: [
          { oQueFazer: "conferir o horário de obra", avaliacao: "o regimento limita sábado", chunkId: "chunk-1" },
          { oQueFazer: "pedir o andar", avaliacao: "não há trecho", chunkId: "inventado" },
        ],
      },
      citations: [
        {
          chunkId: "chunk-1",
          distance: 0.06,
          pageNumber: 8,
          documentTitle: "Regimento interno",
          storageKey: "docs/regimento.pdf",
          content: "Obras aos sábados até as 12h.",
        },
      ],
    });

    expect(view.medidas).toHaveLength(2);
    expect(view.medidas?.[0]?.fonte?.trecho).toBe("Obras aos sábados até as 12h.");
    expect(view.medidas?.[0]?.fonte?.titulo).toBe("Regimento interno");
    expect(view.medidas?.[1]?.fonte).toBeNull();
  });

  it("revisão interrompida sem contexto não deixa recuperados indefinido", () => {
    const view = presentCopilotRevision({ status: "abstained", pendencias: "artigo do regimento" } as CopilotRevisionView);
    expect(view.contextoUtilizado.recuperados).toEqual([]);
    expect(view.contextoUtilizado.registrado).toBe(false);
    expect(view.pendencias).toBe("artigo do regimento");
    expect(view.fontes).toEqual([]);
    expect(view.execucao.registrado).toBe(false);
  });
});
