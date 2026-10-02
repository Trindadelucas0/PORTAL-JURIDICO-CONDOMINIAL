/**
 * Imprime a distância de um JSON de perguntas. Não grava limite novo.
 * Uso: pnpm db:calibrate-retrieval -- perguntas.json
 * JSON: [{ "q": "obra no sábado", "condominiumId": "uuid" }]
 */
import { readFile } from "node:fs/promises";
import { prisma } from "../lib/db/prisma";
import { retrieveForConversation } from "../lib/ai/retriever";
import { retrievalDistanceLimit } from "../lib/ai/env";

type Item = { q: string; conversationId?: string; condominiumId?: string };

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log(`limite atual: ${retrievalDistanceLimit()}`);
    console.log("Passe um JSON [{ q, conversationId }]");
    return;
  }
  const items = JSON.parse(await readFile(file, "utf8")) as Item[];
  console.log(`limite atual: ${retrievalDistanceLimit()}`);
  for (const item of items) {
    if (!item.conversationId) {
      console.log(`pula | sem conversationId | ${item.q}`);
      continue;
    }
    const result = await retrieveForConversation(prisma, item.conversationId, null, item.q);
    const distances = result.chunks.map((row) => row.distance);
    const worst = distances.filter((d): d is number => typeof d === "number").sort((a, b) => b - a)[0];
    console.log(
      JSON.stringify({
        q: item.q,
        motivo: result.motivo,
        chunks: result.chunks.length,
        worst,
      }),
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
