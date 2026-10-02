import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { chunkCondominiumId, chunkText, sniffDocument } from "@/lib/ai/chunks";
import { extractPdfText, stripNul } from "@/lib/ai/extract-pdf";
import { aiEmbedTimeoutMs } from "@/lib/ai/env";
import { officeDocumentRagEligible } from "@/lib/ai/rag-eligibility";
import { createAiProviderFromEnv } from "@/lib/ai/provider";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { isMarkdownFile } from "@/lib/storage/provider";

export type IngestResult =
  | { status: "indexed"; condominiumId?: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; code: string };

export async function ingestOfficeDocument(
  db: PrismaClient = defaultPrisma,
  officeDocumentId: string,
): Promise<IngestResult> {
  const doc = await db.officeDocument.findFirst({ where: { id: officeDocumentId } });
  if (!doc) return { status: "skipped", reason: "missing" };
  if (!officeDocumentRagEligible(doc)) {
    return { status: "skipped", reason: "rag_disabled" };
  }
  let buffer: Buffer;
  try {
    const file = await localDiskStorage.read(doc.storageKey);
    buffer = file.buffer;
  } catch {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped", reason: "path" };
  }
  const extracted = await extractDocumentText(buffer, doc.originalName, doc.mime);
  if (extracted === null) {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped", reason: "type" };
  }
  if (extracted.kind === "pdf" && !extracted.text) {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "failed" } });
    return { status: "failed", code: "PDF_SEM_TEXTO" };
  }
  const text = extracted.text;
  const chunks = chunkText(text);
  const provider = createAiProviderFromEnv();
  if (!chunks.length || !provider) {
    await db.officeDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped", reason: chunks.length ? "no_provider" : "no_text" };
  }
  await db.documentChunk.deleteMany({ where: { officeDocumentId: doc.id } });
  const condoId = chunkCondominiumId(doc.condominiumId, null);
  const vectors = await provider.embed({
    texts: chunks.map((row) => row.content),
    model: process.env.AI_MODEL_EMBED?.trim() || "embed",
    timeoutMs: aiEmbedTimeoutMs(),
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
  return { status: "indexed", condominiumId: condoId };
}

/** Regra geral do escritório: chunk sem condomínio, corpus system. */
export async function ingestSystemDocument(
  db: PrismaClient = defaultPrisma,
  systemDocumentId: string,
): Promise<IngestResult> {
  const doc = await db.systemDocument.findFirst({ where: { id: systemDocumentId } });
  if (!doc) return { status: "skipped", reason: "missing" };
  const skip = async (reason: string): Promise<IngestResult> => {
    await db.systemDocument.update({ where: { id: doc.id }, data: { ingestStatus: "skipped" } });
    return { status: "skipped", reason };
  };
  let buffer: Buffer;
  try {
    const file = await localDiskStorage.read(doc.storageKey);
    buffer = file.buffer;
  } catch {
    return skip("path");
  }
  const extracted = await extractDocumentText(buffer, doc.originalName, doc.mime);
  if (extracted === null) return skip("type");
  if (extracted.kind === "pdf" && !extracted.text) {
    await db.systemDocument.update({ where: { id: doc.id }, data: { ingestStatus: "failed" } });
    return { status: "failed", code: "PDF_SEM_TEXTO" };
  }
  const chunks = chunkText(extracted.text);
  const provider = createAiProviderFromEnv();
  if (!chunks.length || !provider) return skip(chunks.length ? "no_provider" : "no_text");
  await db.documentChunk.deleteMany({ where: { systemDocumentId: doc.id } });
  const vectors = await provider.embed({
    texts: chunks.map((row) => row.content),
    model: process.env.AI_MODEL_EMBED?.trim() || "embed",
    timeoutMs: aiEmbedTimeoutMs(),
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
  return { status: "indexed" };
}

const MAX_TEXT_CHARS = 20000;

/** null = tipo que o ingest não lê. Imagem devolve texto vazio (sem OCR). */
export async function extractDocumentText(
  buffer: Buffer,
  originalName: string,
  mime: string,
): Promise<{ kind: "pdf" | "md" | "image"; text: string } | null> {
  if (buffer.length > 8 * 1024 * 1024) return null;
  if (isMarkdownFile(originalName, mime)) {
    return {
      kind: "md",
      text: stripNul(buffer.toString("utf8").replace(/^\uFEFF/, "")).slice(0, MAX_TEXT_CHARS),
    };
  }
  const kind = sniffDocument(buffer);
  if (!kind) return null;
  if (kind === "pdf") return { kind: "pdf", text: await extractPdfText(buffer) };
  return { kind: "image", text: "" };
}
