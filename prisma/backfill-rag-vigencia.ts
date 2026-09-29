/**
 * Backfill in-place. Nao apaga, nao regrava e nao converte arquivo.
 * 1. Documento nao-audio com ragEnabled false passa a true (mesma regra da
 *    migracao 20260929120000_rag_default_on), em qualquer condominio.
 * 2. Pacote demo (notes demo-ia-): vigenciaDe/vigenciaAte viram
 *    effectiveFrom/effectiveUntil, e o regimento vigente aponta
 *    supersedesDocumentId para o substituido do mesmo condominio.
 * 3. Documento stored, ou indexed sem chunk ativo, entra na fila
 *    ai.document.ingest. Indexed com chunk ativo so ganha a flag.
 * Rodar de novo nao duplica: a fila usa a mesma idempotencyKey.
 */
import { prisma } from "../lib/db/prisma";
import { isAiRagEnabled } from "../lib/ai/flags";
import { enqueueDocumentIndex } from "../lib/search/document-index-port";
import { applyDemoVigencia } from "./demo-vigencia";

async function enableRagForNonAudio() {
  const result = await prisma.officeDocument.updateMany({
    where: {
      ragEnabled: false,
      kind: { not: "audio" },
      NOT: { mime: { startsWith: "audio/", mode: "insensitive" } },
    },
    data: { ragEnabled: true },
  });
  return result.count;
}

async function queueDocumentsWithoutChunks() {
  const docs = await prisma.officeDocument.findMany({
    where: {
      ragEnabled: true,
      OR: [
        { ingestStatus: "stored" },
        { ingestStatus: "indexed", chunks: { none: { active: true } } },
      ],
    },
    select: { id: true, storageKey: true, contentRevision: true, ingestStatus: true },
  });
  let queued = 0;
  for (const doc of docs) {
    const result = await enqueueDocumentIndex({ documentId: doc.id, storageKey: doc.storageKey }, prisma);
    if (!result.queued) {
      console.log(`fila | ${doc.id} | ${doc.ingestStatus} | nao enfileirado: ${result.reason}`);
      continue;
    }
    await prisma.aiJob.updateMany({
      where: {
        type: "ai.document.ingest",
        idempotencyKey: `document:${doc.id}:rev:${doc.contentRevision}`,
        status: { not: "succeeded" },
      },
      data: { status: "queued", lockedAt: null, lastErrorCode: null, runAfter: new Date() },
    });
    queued += 1;
    console.log(`fila | ${doc.id} | ${doc.ingestStatus} | enfileirado`);
  }
  return queued;
}

async function main() {
  const enabled = await enableRagForNonAudio();
  console.log(`ragEnabled ligado agora: ${enabled}`);

  const condos = await prisma.condominium.findMany({
    where: { deletedAt: null },
    select: { id: true, nome: true },
    orderBy: { createdAt: "asc" },
  });
  for (const condo of condos) {
    const result = await applyDemoVigencia(prisma, condo.id);
    if (result.vigencias === 0 && !result.supersedes) continue;
    console.log(`${condo.nome} | vigencias=${result.vigencias} | substitui=${result.supersedes ? "sim" : "nao"}`);
  }

  if (!isAiRagEnabled()) {
    console.log("AI_RAG_ENABLED desligado: nada entrou na fila ai.document.ingest.");
    return;
  }
  const queued = await queueDocumentsWithoutChunks();
  console.log(`Enfileirados para ingest: ${queued}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "falha");
    await prisma.$disconnect();
    process.exit(1);
  });
