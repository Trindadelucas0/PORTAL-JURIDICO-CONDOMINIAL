import type { PrismaClient } from "@prisma/client";
import { notFound } from "@/lib/api/errors";

const OPEN = ["queued", "running", "failed", "dead"] as const;

export async function aiQueueSnapshot(db: PrismaClient) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [queued, running, failed, escalated, tokensAgg, jobs] = await Promise.all([
    db.aiJob.count({ where: { status: "queued" } }),
    db.aiJob.count({ where: { status: "running" } }),
    db.aiJob.count({ where: { status: { in: ["failed", "dead"] } } }),
    db.aiAuditEvent.count({
      where: { createdAt: { gte: dayAgo }, action: { in: ["ESCALATED", "ACTION_BLOCKED"] } },
    }),
    db.aiInteraction.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    db.aiJob.findMany({
      where: { status: { in: [...OPEN] } },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        conversation: {
          select: {
            condominium: { select: { nome: true } },
            tickets: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, protocol: true, priority: true },
            },
          },
        },
      },
    }),
  ]);
  return {
    queued,
    running,
    failed,
    escalated,
    tokensToday: (tokensAgg._sum.inputTokens ?? 0) + (tokensAgg._sum.outputTokens ?? 0),
    jobs: jobs.map((job) => {
      const ticket = job.conversation?.tickets[0] ?? null;
      return {
        id: job.id,
        status: job.status,
        type: job.type,
        createdAt: job.createdAt.toISOString(),
        ticketId: ticket?.id ?? null,
        protocol: ticket?.protocol ?? null,
        priority: ticket?.priority ?? null,
        condominiumName: job.conversation?.condominium?.nome ?? null,
      };
    }),
  };
}

export async function aiUsageSnapshot(db: PrismaClient) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db.aiInteraction.groupBy({
    by: ["conversationId"],
    where: { createdAt: { gte: start } },
    _sum: { inputTokens: true, outputTokens: true, costMicros: true },
  });
  const conversations = await db.conversation.findMany({
    where: { id: { in: rows.map((row) => row.conversationId) } },
    select: { id: true, condominium: { select: { id: true, nome: true } } },
  });
  const byCondo = new Map<string, { nome: string; tokens: number; costMicros: number }>();
  for (const row of rows) {
    const condo = conversations.find((item) => item.id === row.conversationId)?.condominium;
    if (!condo) continue;
    const current = byCondo.get(condo.id) ?? { nome: condo.nome, tokens: 0, costMicros: 0 };
    current.tokens += (row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0);
    current.costMicros += row._sum.costMicros ?? 0;
    byCondo.set(condo.id, current);
  }
  return {
    tokensToday: [...byCondo.values()].reduce((sum, row) => sum + row.tokens, 0),
    condominiums: [...byCondo.entries()].map(([id, row]) => ({ condominiumId: id, ...row })),
  };
}

export async function requeueFailedTicketJobs(db: PrismaClient, ticketId: string) {
  const ticket = await db.ticket.findFirst({
    where: { id: ticketId },
    select: { conversationId: true },
  });
  if (!ticket) throw notFound("Chamado não encontrado");
  if (!ticket.conversationId) return { requeued: 0 };
  const result = await db.aiJob.updateMany({
    where: {
      conversationId: ticket.conversationId,
      type: "ai.inbound",
      status: { in: ["failed", "dead"] },
    },
    data: { status: "queued", attempts: 0, lockedAt: null, lastErrorCode: null, runAfter: new Date() },
  });
  return { requeued: result.count };
}
