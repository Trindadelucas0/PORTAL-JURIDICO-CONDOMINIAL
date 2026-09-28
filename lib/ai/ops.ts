import type { PrismaClient } from "@prisma/client";
import { aiPublicFlags, isAiEnabled } from "@/lib/ai/flags";

const CIRCUIT_WINDOW_MS = 15 * 60 * 1000;
const CIRCUIT_FAILED_THRESHOLD = 5;

export function utcDayStart(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function isAiCircuitOpen(db: PrismaClient, now = new Date()): Promise<boolean> {
  if (!isAiEnabled()) return false;
  const since = new Date(now.getTime() - CIRCUIT_WINDOW_MS);
  const failed = await db.aiJob.count({
    where: { status: { in: ["failed", "dead"] }, createdAt: { gte: since } },
  });
  return failed >= CIRCUIT_FAILED_THRESHOLD;
}

export async function aiOpsSnapshot(db: PrismaClient, now = new Date()) {
  const start = utcDayStart(now);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [queued, running, failed24h, tokensAgg, circuitOpen] = await Promise.all([
    db.aiJob.count({ where: { status: "queued" } }),
    db.aiJob.count({ where: { status: "running" } }),
    db.aiJob.count({ where: { status: { in: ["failed", "dead"] }, createdAt: { gte: dayAgo } } }),
    db.aiInteraction.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    isAiCircuitOpen(db, now),
  ]);
  const tokensToday = (tokensAgg._sum.inputTokens ?? 0) + (tokensAgg._sum.outputTokens ?? 0);
  return {
    queued,
    running,
    failed24h,
    tokensToday,
    circuitOpen,
    flags: aiPublicFlags(),
  };
}

export function prometheusText(snapshot: Awaited<ReturnType<typeof aiOpsSnapshot>>): string {
  return [
    `juricon_ai_jobs_queued ${snapshot.queued}`,
    `juricon_ai_tokens_today ${snapshot.tokensToday}`,
    `juricon_ai_circuit_open ${snapshot.circuitOpen ? 1 : 0}`,
    "",
  ].join("\n");
}
