export const AI_AUDIT_RETENTION_DAYS = 180;
export const AI_REJECTED_MEMORY_DAYS = 30;

export function shouldPurge(createdAt: Date, days: number, now = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > days * 24 * 60 * 60 * 1000;
}

export function purgeCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function runRetentionPurge(
  db: {
    aiAuditEvent: { deleteMany(args: { where: { createdAt: { lt: Date } } }): Promise<{ count: number }> };
    aiContactMemory: {
      deleteMany(args: { where: { status: string; createdAt: { lt: Date } } }): Promise<{ count: number }>;
    };
  },
  now = new Date(),
) {
  const audit = await db.aiAuditEvent.deleteMany({
    where: { createdAt: { lt: purgeCutoff(AI_AUDIT_RETENTION_DAYS, now) } },
  });
  const memory = await db.aiContactMemory.deleteMany({
    where: { status: "rejected", createdAt: { lt: purgeCutoff(AI_REJECTED_MEMORY_DAYS, now) } },
  });
  return { audit: audit.count, memory: memory.count };
}

export function retentionIdempotencyKey(now = new Date()): string {
  return `purge:${now.toISOString().slice(0, 10)}`;
}
