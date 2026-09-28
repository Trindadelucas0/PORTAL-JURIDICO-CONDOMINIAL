import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { isAiRagEnabled } from "@/lib/ai/flags";
import { isUniqueConflict, prismaErrorCode } from "@/lib/ai/errors";

export type IndexEnqueueInput = {
  documentId: string;
  storageKey: string;
};

export type IndexEnqueueResult =
  | { queued: false; reason: "noop" | "error" }
  | { queued: true; reason: "queued" };

export interface DocumentIndexPort {
  enqueue(input: IndexEnqueueInput): Promise<IndexEnqueueResult>;
}

export async function enqueueDocumentIndex(
  input: IndexEnqueueInput,
  db: PrismaClient = defaultPrisma,
): Promise<IndexEnqueueResult> {
  if (!isAiRagEnabled()) return { queued: false, reason: "noop" };
  try {
    const doc = await db.officeDocument.findFirst({
      where: { id: input.documentId },
      select: { id: true, contentRevision: true },
    });
    if (!doc) return { queued: false, reason: "error" };
    await db.aiJob.create({
      data: {
        type: "ai.document.ingest",
        idempotencyKey: `document:${doc.id}:rev:${doc.contentRevision}`,
        officeDocumentId: doc.id,
        status: "queued",
      },
    });
    await db.officeDocument.update({
      where: { id: doc.id },
      data: { ingestStatus: "pending_index" },
    });
    return { queued: true, reason: "queued" };
  } catch (error) {
    if (isUniqueConflict(error)) return { queued: true, reason: "queued" };
    console.error(`[ai] document index errorCode=${prismaErrorCode(error)}`);
    return { queued: false, reason: "error" };
  }
}

export const noopDocumentIndex: DocumentIndexPort = {
  async enqueue(input) {
    return enqueueDocumentIndex(input);
  },
};
