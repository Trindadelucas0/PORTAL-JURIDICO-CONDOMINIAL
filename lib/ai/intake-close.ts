import type { Prisma, PrismaClient } from "@prisma/client";
import { unprocessable } from "@/lib/api/errors";
import { intakeSessionOpen } from "@/lib/ai/intake-cycle";

type Db = PrismaClient | Prisma.TransactionClient;

const OPEN = ["collecting", "waiting_client", "processing"] as const;
const HUMAN_CLOSE = ["collecting", "waiting_client", "processing", "ready_for_human"] as const;

export async function writeIntakeAudit(
  db: Db,
  input: {
    action: string;
    conversationId: string;
    ticketId?: string | null;
    actorId?: string | null;
    result: string;
  },
) {
  await db.aiAuditEvent.create({
    data: {
      action: input.action,
      conversationId: input.conversationId,
      ticketId: input.ticketId ?? null,
      actorId: input.actorId ?? null,
      result: input.result.slice(0, 80),
    },
  });
}

export async function succeedIntakeTimeouts(db: Db, sessionId: string) {
  await db.aiJob.updateMany({
    where: {
      type: "ai.intake.timeout",
      status: "queued",
      idempotencyKey: { startsWith: `intake-timeout:${sessionId}:` },
    },
    data: { status: "succeeded", lockedAt: null, lastErrorCode: null },
  });
}

export async function interruptIntakeSession(db: PrismaClient, conversationId: string, actorId: string) {
  const open = await db.aiIntakeSession.findFirst({
    where: { conversationId, status: { in: [...OPEN] } },
    orderBy: { startedAt: "desc" },
  });
  if (!open || !intakeSessionOpen(open.status)) {
    throw unprocessable("Não há coleta aberta nesta conversa");
  }
  await db.aiIntakeSession.update({
    where: { id: open.id },
    data: { status: "interrupted", closeReason: "operador", completedAt: new Date() },
  });
  await succeedIntakeTimeouts(db, open.id);
  await writeIntakeAudit(db, {
    action: "AI_INTAKE_INTERRUPTED",
    conversationId,
    actorId,
    result: "interrupted",
  });
  return { status: "interrupted" as const };
}

/** Mensagem humana já enviada. Nota interna não passa por dispatchToWhatsApp. */
export async function closeIntakeOnHumanOutbound(db: PrismaClient, conversationId: string, actorId: string | null) {
  const session = await db.aiIntakeSession.findFirst({
    where: { conversationId, status: { in: [...HUMAN_CLOSE] } },
    orderBy: { startedAt: "desc" },
  });
  if (!session) return;
  const stillCollecting = session.status !== "ready_for_human";
  await db.aiIntakeSession.update({
    where: { id: session.id },
    data: {
      status: stillCollecting ? "interrupted" : "completed",
      closeReason: "humano",
      completedAt: new Date(),
    },
  });
  await succeedIntakeTimeouts(db, session.id);
  await writeIntakeAudit(db, {
    action: stillCollecting ? "AI_INTAKE_INTERRUPTED" : "AI_INTAKE_COMPLETED",
    conversationId,
    actorId,
    result: stillCollecting ? "interrupted" : "completed",
  });
}
