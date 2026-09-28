import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { isAiRagEnabled } from "@/lib/ai/flags";
import { fetchInboundMediaBase64 } from "@/lib/channels/evolution-baileys-provider";
import { enqueueDocumentIndex } from "@/lib/search/document-index-port";
import { mustRejectScan, scanBuffer } from "@/lib/security/clamav-scan";
import { isAllowedMime } from "@/lib/storage/provider";
import { localDiskStorage } from "@/lib/storage/local-disk";

export async function downloadInboundMedia(db: PrismaClient, job: { id: string; idempotencyKey: string; conversationId: string | null }) {
  const waMessageId = job.idempotencyKey.startsWith("media:")
    ? job.idempotencyKey.slice("media:".length)
    : job.idempotencyKey;
  const message = await db.message.findFirst({
    where: { waMessageId },
    include: { attachments: true, conversation: true },
  });
  if (!message) return { status: "failed" as const, code: "MISSING" };
  if (message.attachments.length > 0) return { status: "succeeded" as const, code: "exists" };

  const media = await fetchInboundMediaBase64(waMessageId);
  const mime = media.mimetype.split(";")[0]?.trim() || media.mimetype;
  if (!isAllowedMime(mime)) return { status: "failed" as const, code: "TYPE" };

  const scan = await scanBuffer(media.buffer);
  if (mustRejectScan(scan)) return { status: "failed" as const, code: scan === "infected" ? "VIRUS" : "SCAN" };

  const stored = await localDiskStorage.save(media.buffer, media.fileName, mime);
  await db.messageAttachment.create({
    data: {
      messageId: message.id,
      storageKey: stored.storageKey,
      mime: stored.mime,
      sizeBytes: stored.sizeBytes,
      originalName: stored.originalName,
    },
  });

  const isPdf = mime === "application/pdf" || stored.originalName.toLowerCase().endsWith(".pdf");
  if (isPdf && message.ticketId && message.conversation.condominiumId && isAiRagEnabled()) {
    const admin = await db.user.findFirst({
      where: { role: "admin", ativo: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (admin) {
      const sha256 = createHash("sha256").update(media.buffer).digest("hex");
      const doc = await db.officeDocument.create({
        data: {
          condominiumId: message.conversation.condominiumId,
          ticketId: message.ticketId,
          uploadedById: admin.id,
          kind: "outro",
          title: stored.originalName.slice(0, 160) || "Documento WhatsApp",
          purpose: "Documento recebido no WhatsApp do chamado.",
          storageKey: stored.storageKey,
          mime: stored.mime,
          sizeBytes: stored.sizeBytes,
          originalName: stored.originalName,
          sha256,
          ingestStatus: "stored",
        },
      });
      await enqueueDocumentIndex({ documentId: doc.id, storageKey: doc.storageKey }, db);
    }
  }

  return { status: "succeeded" as const, code: null };
}
