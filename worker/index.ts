import { prisma } from "@/lib/db/prisma";
import { processConversation } from "@/lib/ai/process-conversation";
import { retentionIdempotencyKey, runRetentionPurge } from "@/lib/ai/retention";
import { ingestOfficeDocument, ingestSystemDocument } from "./ingest-document";
import { downloadInboundMedia } from "./download-inbound-media";

const GLOBAL_CONCURRENCY = 2;
let active = 0;
const running = new Set<string>();

function systemDocumentIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { systemDocumentId?: unknown }).systemDocumentId;
  return typeof value === "string" && value.trim() ? value : null;
}

async function rescueStale() {
  const cutoff = new Date(Date.now() - 3 * 60 * 1000);
  await prisma.aiJob.updateMany({
    where: { status: "running", lockedAt: { lt: cutoff } },
    data: { status: "queued", lockedAt: null },
  });
}

async function enqueueDailyPurge() {
  await prisma.aiJob.createMany({
    data: [
      {
        type: "ai.retention.purge",
        idempotencyKey: retentionIdempotencyKey(),
        status: "queued",
      },
    ],
    skipDuplicates: true,
  });
}

async function tick() {
  await rescueStale();
  await enqueueDailyPurge();
  if (active >= GLOBAL_CONCURRENCY) return;
  const jobs = await prisma.aiJob.findMany({
    where: { status: "queued", runAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  for (const job of jobs) {
    if (active >= GLOBAL_CONCURRENCY) break;
    if (job.type === "ai.inbound" && job.conversationId) {
      if (running.has(job.conversationId)) continue;
      running.add(job.conversationId);
      active += 1;
      void processConversation(prisma, job.conversationId)
        .catch((error) => {
          const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "ERROR";
          console.error(`[ai] worker errorCode=${code}`);
        })
        .finally(() => {
          running.delete(job.conversationId!);
          active -= 1;
        });
      continue;
    }
    if (job.type === "ai.document.ingest" && job.officeDocumentId) {
      active += 1;
      const documentId = job.officeDocumentId;
      void (async () => {
        await prisma.aiJob.update({ where: { id: job.id }, data: { status: "running", lockedAt: new Date() } });
        try {
          const result = await ingestOfficeDocument(prisma, documentId);
          if (result.status === "failed") {
            await prisma.aiJob.update({
              where: { id: job.id },
              data: { status: "failed", lockedAt: null, lastErrorCode: result.code },
            });
          } else {
            await prisma.aiJob.update({ where: { id: job.id }, data: { status: "succeeded", lockedAt: null } });
          }
        } catch {
          await prisma.aiJob.update({
            where: { id: job.id },
            data: { status: "failed", lockedAt: null, lastErrorCode: "INGEST" },
          });
        }
      })().finally(() => {
        active -= 1;
      });
      continue;
    }
    if (job.type === "ai.system_document.ingest") {
      const systemDocumentId = systemDocumentIdFromPayload(job.payload);
      if (!systemDocumentId) {
        await prisma.aiJob.update({ where: { id: job.id }, data: { status: "failed", lastErrorCode: "PAYLOAD" } });
        continue;
      }
      active += 1;
      void (async () => {
        await prisma.aiJob.update({ where: { id: job.id }, data: { status: "running", lockedAt: new Date() } });
        try {
          const result = await ingestSystemDocument(prisma, systemDocumentId);
          if (result.status === "failed") {
            await prisma.aiJob.update({
              where: { id: job.id },
              data: { status: "failed", lockedAt: null, lastErrorCode: result.code },
            });
          } else {
            await prisma.aiJob.update({ where: { id: job.id }, data: { status: "succeeded", lockedAt: null } });
          }
        } catch {
          await prisma.aiJob.update({
            where: { id: job.id },
            data: { status: "failed", lockedAt: null, lastErrorCode: "INGEST" },
          });
        }
      })().finally(() => {
        active -= 1;
      });
      continue;
    }
    if (job.type === "ai.media.download") {
      active += 1;
      void (async () => {
        await prisma.aiJob.update({ where: { id: job.id }, data: { status: "running", lockedAt: new Date(), attempts: { increment: 1 } } });
        try {
          const result = await downloadInboundMedia(prisma, job);
          await prisma.aiJob.update({
            where: { id: job.id },
            data: {
              status: result.status === "succeeded" ? "succeeded" : "failed",
              lockedAt: null,
              lastErrorCode: result.code,
            },
          });
        } catch {
          await prisma.aiJob.update({
            where: { id: job.id },
            data: { status: "failed", lockedAt: null, lastErrorCode: "MEDIA" },
          });
        }
      })().finally(() => {
        active -= 1;
      });
      continue;
    }
    if (job.type === "ai.retention.purge") {
      active += 1;
      void (async () => {
        await prisma.aiJob.update({ where: { id: job.id }, data: { status: "running", lockedAt: new Date() } });
        try {
          await runRetentionPurge(prisma);
          await prisma.aiJob.update({ where: { id: job.id }, data: { status: "succeeded", lockedAt: null } });
        } catch {
          await prisma.aiJob.update({
            where: { id: job.id },
            data: { status: "failed", lockedAt: null, lastErrorCode: "PURGE" },
          });
        }
      })().finally(() => {
        active -= 1;
      });
    }
  }
}

const workerGlobal = globalThis as typeof globalThis & {
  juriconWorkerLoopStarted?: boolean;
  juriconTick?: () => Promise<void>;
};

async function main() {
  console.log(JSON.stringify({ worker: "juricon", status: "up" }));
  for (;;) {
    try {
      await (workerGlobal.juriconTick ?? tick)();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "ERROR";
      console.error(`[ai] tick errorCode=${code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

workerGlobal.juriconTick = tick;

export function startWorkerLoop() {
  workerGlobal.juriconTick = tick;
  if (workerGlobal.juriconWorkerLoopStarted) return;
  workerGlobal.juriconWorkerLoopStarted = true;
  void main();
}

const startedAsCli = process.argv.some((arg) => arg.replace(/\\/g, "/").endsWith("worker/index.ts"));
if (startedAsCli || process.env.JURICON_WORKER === "1") {
  startWorkerLoop();
}

export { tick, rescueStale, enqueueDailyPurge };
