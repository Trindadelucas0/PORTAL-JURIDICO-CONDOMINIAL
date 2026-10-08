import type { PrismaClient } from "@prisma/client";
import { aiPublicFlags, isAiEnabled } from "@/lib/ai/flags";
import { INTAKE_AUDIT_ACTIONS, type IntakeAuditAction } from "@/lib/ai/intake-cycle";

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
  const [queued, running, failed24h, tokensAgg, circuitOpen, intakeRows] = await Promise.all([
    db.aiJob.count({ where: { status: "queued" } }),
    db.aiJob.count({ where: { status: "running" } }),
    db.aiJob.count({ where: { status: { in: ["failed", "dead"] }, createdAt: { gte: dayAgo } } }),
    db.aiInteraction.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    isAiCircuitOpen(db, now),
    db.aiAuditEvent.groupBy({
      by: ["action"],
      where: { createdAt: { gte: start }, action: { in: [...INTAKE_AUDIT_ACTIONS] } },
      _count: { _all: true },
    }),
  ]);
  const tokensToday = (tokensAgg._sum.inputTokens ?? 0) + (tokensAgg._sum.outputTokens ?? 0);
  const intakeToday = Object.fromEntries(INTAKE_AUDIT_ACTIONS.map((action) => [action, 0])) as Record<IntakeAuditAction, number>;
  for (const row of intakeRows) {
    if ((INTAKE_AUDIT_ACTIONS as readonly string[]).includes(row.action)) {
      intakeToday[row.action as IntakeAuditAction] = row._count._all;
    }
  }
  return {
    queued,
    running,
    failed24h,
    tokensToday,
    circuitOpen,
    flags: aiPublicFlags(),
    intakeToday,
  };
}

export function prometheusText(snapshot: Awaited<ReturnType<typeof aiOpsSnapshot>>): string {
  return [
    `juricon_ai_jobs_queued ${snapshot.queued}`,
    `juricon_ai_tokens_today ${snapshot.tokensToday}`,
    `juricon_ai_circuit_open ${snapshot.circuitOpen ? 1 : 0}`,
    `juricon_ai_intake_started_today ${snapshot.intakeToday.AI_INTAKE_STARTED}`,
    `juricon_ai_question_sent_today ${snapshot.intakeToday.AI_QUESTION_SENT}`,
    `juricon_ai_intake_nudge_today ${snapshot.intakeToday.AI_INTAKE_NUDGE}`,
    `juricon_ai_context_updated_today ${snapshot.intakeToday.AI_CONTEXT_UPDATED}`,
    `juricon_ai_intake_completed_today ${snapshot.intakeToday.AI_INTAKE_COMPLETED}`,
    `juricon_ai_intake_interrupted_today ${snapshot.intakeToday.AI_INTAKE_INTERRUPTED}`,
    `juricon_ai_human_review_required_today ${snapshot.intakeToday.AI_HUMAN_REVIEW_REQUIRED}`,
    "",
  ].join("\n");
}
