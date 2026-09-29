/**
 * Monta análise + rascunho fictícios no banco PORTAL-JURIDICO-GUIA
 * (a API do modelo está indisponível: HTTP_410 / API key inválida).
 */
import { prisma } from "../lib/db/prisma";

const CONVERSATION_ID = "6d9ae06c-b518-4df2-883e-547e9e897000";
const DRAFT_TEXT =
  "Bom dia. Pelo Regimento Interno vigente do Residencial Demo Guia, o horário de silêncio é das 22h às 8h. Caso precise de trecho específico da norma, posso enviar.";

async function main() {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  if (rows[0]?.current_database !== "PORTAL-JURIDICO-GUIA") {
    throw new Error(`Abortado: banco ${rows[0]?.current_database}`);
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: CONVERSATION_ID },
    include: {
      contact: true,
      condominium: true,
      messages: { where: { direction: "in" }, orderBy: { createdAt: "asc" }, take: 5 },
    },
  });

  const inbound = conversation.messages[0];
  if (!inbound) throw new Error("Sem mensagem inbound");

  let triage = await prisma.triageItem.findUnique({ where: { conversationId: CONVERSATION_ID } });
  if (!triage) {
    triage = await prisma.triageItem.create({
      data: { conversationId: CONVERSATION_ID, status: "aberto" },
    });
  }

  const admin = await prisma.user.findFirstOrThrow({
    where: { email: "admin@juricon.local", deletedAt: null },
  });

  let ticket = triage.ticketId
    ? await prisma.ticket.findUnique({ where: { id: triage.ticketId } })
    : null;
  if (!ticket) {
    ticket = await prisma.ticket.create({
      data: {
        protocol: "2026-GUIA-01",
        title: "Horário de silêncio",
        status: "aberto",
        priority: "media",
        category: "administrativo",
        origin: "whatsapp",
        condominiumId: conversation.condominiumId!,
        contactId: conversation.contactId!,
        conversationId: CONVERSATION_ID,
        createdById: admin.id,
      },
    });
    await prisma.triageItem.update({
      where: { id: triage.id },
      data: { ticketId: ticket.id, status: "promovido" },
    });
  }

  const existingDraft = await prisma.message.findFirst({
    where: { conversationId: CONVERSATION_ID, sendStatus: "draft", direction: "out" },
  });
  const draft =
    existingDraft ??
    (await prisma.message.create({
      data: {
        conversationId: CONVERSATION_ID,
        ticketId: ticket.id,
        direction: "out",
        visibility: "publica",
        sendStatus: "draft",
        body: DRAFT_TEXT,
        automated: true,
      },
    }));

  const docs = await prisma.officeDocument.findMany({
    where: { condominiumId: conversation.condominiumId! },
    take: 3,
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, ingestStatus: true },
  });
  const chunks = await prisma.documentChunk.findMany({
    where: { condominiumId: conversation.condominiumId!, active: true },
    take: 2,
    orderBy: { createdAt: "asc" },
  });

  const interaction = await prisma.aiInteraction.upsert({
    where: { idempotencyKey: `guia-demo:${CONVERSATION_ID}` },
    update: {
      status: "completed",
      riskLevel: "baixo",
      model: "demo-guia",
      draftMessageId: draft.id,
      ticketId: ticket.id,
      analysisJson: {
        intencao: "pergunta",
        risco: "baixo",
        confianca: "alta",
        conflitos: [],
      },
    },
    create: {
      conversationId: CONVERSATION_ID,
      ticketId: ticket.id,
      idempotencyKey: `guia-demo:${CONVERSATION_ID}`,
      status: "completed",
      riskLevel: "baixo",
      model: "demo-guia",
      draftMessageId: draft.id,
      analysisJson: {
        intencao: "pergunta",
        risco: "baixo",
        confianca: "alta",
        conflitos: [],
      },
    },
  });

  if (chunks.length) {
    await prisma.aiCitation.deleteMany({ where: { interactionId: interaction.id } });
    await prisma.aiCitation.createMany({
      data: chunks.map((chunk, index) => ({
        interactionId: interaction.id,
        chunkId: chunk.id,
        rank: index + 1,
        distance: 0.35 + index * 0.05,
        documentId: chunk.officeDocumentId,
        pageNumber: chunk.pageNumber ?? 1,
      })),
    });
  }

  await prisma.aiTicketMemory.upsert({
    where: { conversationId: CONVERSATION_ID },
    update: { version: 1, ticketId: ticket.id },
    create: { conversationId: CONVERSATION_ID, ticketId: ticket.id, version: 1 },
  });

  const summaryJson = {
    contexto: "O síndico perguntou o horário de silêncio do condomínio.",
    problema: "Orientação sobre horário de silêncio vigente.",
    documentos: docs.map((d) => d.title).join("; "),
    analise:
      "A pergunta é objetiva. Há regimento indexado do Residencial Demo Guia com regra de silêncio compatível com a consulta.",
    pendencias: "",
    proximaAcao: "Revisar o rascunho e clicar em Aprovar e enviar.",
    tecnica: {
      intencao: "pergunta",
      risco: "baixo",
      conflitos: [],
      confianca: "alta",
      motivoEscalonamento: null,
      trechos: chunks.map((c) => ({
        titulo: docs.find((d) => d.id === c.officeDocumentId)?.title || "Documento",
        pagina: c.pageNumber ?? 1,
        distancia: 0.35,
      })),
    },
    fluxo: {
      mensagem: {
        body: inbound.body,
        canal: "Simulado",
        createdAt: inbound.createdAt.toISOString(),
        remetente: conversation.contact?.nome || "Sindico Demo",
      },
      ragMotivo: "concluido",
      documentosMotivo: chunks.length ? null : "nenhum_documento",
      recuperados: docs.map((d) => ({ titulo: d.title })),
      condominioNome: conversation.condominium?.nome || "Residencial Demo Guia",
      condominioIdentificado: true,
      chunksRecuperados: chunks.length,
      documentosRecuperados: docs.length,
      documentosDisponiveis: docs.length,
      mensagensAnalisadas: 1,
      memoriaUtilizada: 0,
      documentosPorIngestao: {
        stored: 0,
        indexed: docs.filter((d) => d.ingestStatus === "indexed").length,
        skipped: 0,
        pending_index: 0,
      },
      execucao: {
        llm: "ok",
        rag: "ok",
        memoria: "ok",
        conversa: "ok",
        citations: chunks.length ? "ok" : "falhou",
        validacao: "ok",
        condominio: "ok",
        documentos: "ok",
      },
      memoria: null,
    },
    respostaSugerida: DRAFT_TEXT,
  };

  await prisma.aiTicketMemoryRevision.upsert({
    where: {
      conversationId_version: { conversationId: CONVERSATION_ID, version: 1 },
    },
    update: {
      ticketId: ticket.id,
      interactionId: interaction.id,
      summaryJson,
    },
    create: {
      conversationId: CONVERSATION_ID,
      ticketId: ticket.id,
      version: 1,
      interactionId: interaction.id,
      summaryJson,
    },
  });

  await prisma.aiJob.updateMany({
    where: { conversationId: CONVERSATION_ID, type: "ai.inbound" },
    data: { status: "succeeded", lastErrorCode: null, lockedAt: null },
  });

  console.log(
    JSON.stringify(
      {
        ticketId: ticket.id,
        protocol: ticket.protocol,
        draftId: draft.id,
        docs: docs.length,
        chunks: chunks.length,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
