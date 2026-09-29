/**
 * Backfill in-place dos Documentos do sistema. Nao apaga, nao regrava e nao converte arquivo.
 * Todo SystemDocument ainda stored entra na fila ai.system_document.ingest.
 * Rodar de novo nao duplica: a fila usa a idempotencyKey system-document:{id}.
 */
import { prisma } from "../lib/db/prisma";
import { isAiRagEnabled } from "../lib/ai/flags";
import { enqueueSystemDocumentIndex } from "../lib/search/document-index-port";

async function queueStoredSystemDocuments() {
  const docs = await prisma.systemDocument.findMany({
    where: { ingestStatus: "stored" },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });
  let queued = 0;
  for (const doc of docs) {
    const result = await enqueueSystemDocumentIndex(doc.id, prisma);
    if (!result.queued) {
      console.log(`fila | ${doc.id} | nao enfileirado: ${result.reason}`);
      continue;
    }
    queued += 1;
    console.log(`fila | ${doc.id} | enfileirado`);
  }
  return queued;
}

async function main() {
  if (!isAiRagEnabled()) {
    console.log("AI_RAG_ENABLED desligado: nada entrou na fila ai.system_document.ingest.");
    return;
  }
  const queued = await queueStoredSystemDocuments();
  console.log(`Documentos do sistema enfileirados para ingest: ${queued}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "falha");
    await prisma.$disconnect();
    process.exit(1);
  });
