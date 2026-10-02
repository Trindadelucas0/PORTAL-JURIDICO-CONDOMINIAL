/**
 * Marca documento com chunk ativo de volta a stored e enfileira ingest.
 * Chunks antigos (bloco 3200) saem no próximo ingest (deleteMany).
 */
import { prisma } from "../lib/db/prisma";
import { isAiRagEnabled } from "../lib/ai/flags";
import { enqueueDocumentIndex, enqueueSystemDocumentIndex } from "../lib/search/document-index-port";

async function main() {
  if (!isAiRagEnabled()) {
    console.log("AI_RAG_ENABLED desligado: nada entrou na fila.");
    return;
  }
  const office = await prisma.officeDocument.findMany({
    where: { ragEnabled: true, ingestStatus: { in: ["indexed", "failed", "stored", "skipped"] } },
    select: { id: true, storageKey: true, contentRevision: true, ingestStatus: true },
  });
  let queued = 0;
  for (const doc of office) {
    await prisma.officeDocument.update({
      where: { id: doc.id },
      data: { ingestStatus: "stored" },
    });
    const result = await enqueueDocumentIndex({ documentId: doc.id, storageKey: doc.storageKey }, prisma);
    await prisma.aiJob.updateMany({
      where: {
        type: "ai.document.ingest",
        idempotencyKey: `document:${doc.id}:rev:${doc.contentRevision}`,
      },
      data: { status: "queued", lockedAt: null, lastErrorCode: null, runAfter: new Date() },
    });
    if (result.queued) queued += 1;
    console.log(`office | ${doc.id} | ${doc.ingestStatus} | ${result.reason}`);
  }
  const system = await prisma.systemDocument.findMany({
    where: { ingestStatus: { in: ["indexed", "failed", "stored", "skipped"] } },
    select: { id: true, ingestStatus: true },
  });
  for (const doc of system) {
    await prisma.systemDocument.update({ where: { id: doc.id }, data: { ingestStatus: "stored" } });
    const result = await enqueueSystemDocumentIndex(doc.id, prisma);
    await prisma.aiJob.updateMany({
      where: { type: "ai.system_document.ingest", idempotencyKey: `system-document:${doc.id}` },
      data: { status: "queued", lockedAt: null, lastErrorCode: null, runAfter: new Date() },
    });
    if (result.queued) queued += 1;
    console.log(`system | ${doc.id} | ${doc.ingestStatus} | ${result.reason}`);
  }
  console.log(`enfileirados: ${queued}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
