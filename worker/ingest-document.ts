import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { chunkCondominiumId, chunkText, sniffDocument } from "@/lib/ai/chunks";
import { officeDocumentRagEligible } from "@/lib/ai/rag-eligibility";
import { createAiProviderFromEnv } from "@/lib/ai/provider";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { isMarkdownFile } from "@/lib/storage/provider";

export async function ingestOfficeDocument(db: PrismaClient = defaultPrisma, officeDocumentId: string) {
  const doc = await db.officeDocument.findFirst({ where: { id: officeDocumentId } });
  if (!doc) return { status: "skipped" as const, reason: "missing" };
  if (!officeDocumentRagEligible(doc)) {
    return { status: "skipped" as const, reason: "rag_disabled" };
  }
  let buffer: Buffer;
  try {
    const file = await localDiskStorage.read(doc.storageKey);
    buffer = file.buffer;
  } catch {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped" as const, reason: "path" };
  }
  const text = extractDocumentText(buffer, doc.originalName, doc.mime);
  if (text === null) {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped" as const, reason: "type" };
  }
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

/** Regra geral do escritório: chunk sem condomínio, corpus system. */
export async function ingestSystemDocument(db: PrismaClient = defaultPrisma, systemDocumentId: string) {
  const doc = await db.systemDocument.findFirst({ where: { id: systemDocumentId } });
  if (!doc) return { status: "skipped" as const, reason: "missing" };
  const skip = async (reason: string) => {
    await db.systemDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped" as const, reason };
  };
  let buffer: Buffer;
  try {
    const file = await localDiskStorage.read(doc.storageKey);
    buffer = file.buffer;
  } catch {
    return skip("path");
  }
  const text = extractDocumentText(buffer, doc.originalName, doc.mime);
  if (text === null) return skip("type");
  const chunks = chunkText(text);
  const provider = createAiProviderFromEnv();
  if (!chunks.length || !provider) return skip(chunks.length ? "no_provider" : "no_text");
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
        "id", "systemDocumentId", "officeDocumentId", "condominiumId", "corpus", "pageNumber", "chunkIndex",
        "content", "contentHash", "embedding", "active", "createdAt"
      ) VALUES (
        ${crypto.randomUUID()}::uuid,
        ${doc.id}::uuid,
        NULL,
        NULL,
        'system',
        1,
        ${row.index},
        ${row.content},
        ${hash},
        ${literal}::vector,
        true,
        NOW()
      )
      ON CONFLICT ("systemDocumentId", "contentHash") DO NOTHING
    `;
  }
  await db.systemDocument.update({
    where: { id: doc.id },
    data: { ingestStatus: "indexed", indexedAt: new Date() },
  });
  return { status: "indexed" as const };
}

const MAX_TEXT_CHARS = 20000;

/** null = tipo que o ingest não lê. Imagem devolve texto vazio (sem OCR). */
function extractDocumentText(buffer: Buffer, originalName: string, mime: string): string | null {
  if (buffer.length > 8 * 1024 * 1024) return null;
  if (isMarkdownFile(originalName, mime)) {
    return buffer.toString("utf8").replace(/^\uFEFF/, "").slice(0, MAX_TEXT_CHARS);
  }
  const kind = sniffDocument(buffer);
  if (!kind) return null;
  return kind === "pdf" ? extractPdfLiterals(buffer) : "";
}

function extractPdfLiterals(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const parts: string[] = [];
  const pattern = /\((?:\\\)|[^)]){2,200}\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const text = match[0].slice(1, -1).replace(/\\n/g, " ").replace(/\\/g, "");
    if (/[A-Za-zÀ-ÿ]{3,}/.test(text)) parts.push(text);
    if (parts.join(" ").length > MAX_TEXT_CHARS) break;
  }
  return parts.join(" ").slice(0, MAX_TEXT_CHARS);
}
