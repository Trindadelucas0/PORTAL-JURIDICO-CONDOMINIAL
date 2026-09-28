import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { chunkCondominiumId, chunkText, sniffDocument } from "@/lib/ai/chunks";
import { createAiProviderFromEnv } from "@/lib/ai/provider";
import { localDiskStorage } from "@/lib/storage/local-disk";

export async function ingestOfficeDocument(db: PrismaClient = defaultPrisma, officeDocumentId: string) {
  const doc = await db.officeDocument.findFirst({ where: { id: officeDocumentId } });
  if (!doc) return { status: "skipped" as const, reason: "missing" };
  let buffer: Buffer;
  try {
    const file = await localDiskStorage.read(doc.storageKey);
    buffer = file.buffer;
  } catch {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped" as const, reason: "path" };
  }
  const kind = sniffDocument(buffer);
  if (!kind || buffer.length > 8 * 1024 * 1024) {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped" as const, reason: "type" };
  }
  const text = kind === "pdf" ? extractPdfLiterals(buffer) : "";
  const chunks = chunkText(text);
  const provider = createAiProviderFromEnv();
  if (!chunks.length || !provider) {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped" as const, reason: chunks.length ? "no_provider" : "no_text" };
  }
  const condoId = chunkCondominiumId(doc.condominiumId, null);
  const vectors = await provider.embed({
    texts: chunks.map((row) => row.content),
    model: process.env.AI_MODEL_EMBED?.trim() || "embed",
    timeoutMs: 25000,
    inputType: "passage",
  });
  for (const row of chunks) {
    const embedding = vectors[row.index];
    if (!embedding || embedding.length !== 1536 || embedding.some((value) => !Number.isFinite(value))) continue;
    const hash = createHash("sha256").update(row.content).digest("hex");
    const literal = `[${embedding.join(",")}]`;
    await db.$executeRaw`
      INSERT INTO "DocumentChunk" (
        "id", "officeDocumentId", "condominiumId", "corpus", "pageNumber", "chunkIndex",
        "content", "contentHash", "embedding", "active", "createdAt"
      ) VALUES (
        ${crypto.randomUUID()}::uuid,
        ${doc.id}::uuid,
        ${condoId}::uuid,
        'condominium',
        1,
        ${row.index},
        ${row.content},
        ${hash},
        ${literal}::vector,
        true,
        NOW()
      )
      ON CONFLICT ("officeDocumentId", "contentHash") DO NOTHING
    `;
  }
  await db.officeDocument.update({
    where: { id: doc.id },
    data: { ingestStatus: "indexed", indexedAt: new Date() },
  });
  return { status: "indexed" as const, condominiumId: condoId };
}

function extractPdfLiterals(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const parts: string[] = [];
  const pattern = /\((?:\\\)|[^)]){2,200}\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const text = match[0].slice(1, -1).replace(/\\n/g, " ").replace(/\\/g, "");
    if (/[A-Za-zÀ-ÿ]{3,}/.test(text)) parts.push(text);
    if (parts.join(" ").length > 20000) break;
  }
  return parts.join(" ").slice(0, 20000);
}
