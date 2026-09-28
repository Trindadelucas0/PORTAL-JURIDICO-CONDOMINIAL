import type { Prisma, PrismaClient, User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";

const SECRET_KEYS = new Set(["passwordHash", "passwordOnce", "token", "tokenHash", "apikey", "apiKey"]);

function stripSecrets(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return value as Prisma.InputJsonValue;
  if (Array.isArray(value)) return value as Prisma.InputJsonValue;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = item;
  }
  return out as Prisma.InputJsonValue;
}

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(db: PrismaClient | Prisma.TransactionClient, input: AuditInput) {
  await db.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: stripSecrets(input.before),
      afterJson: stripSecrets(input.after),
    },
  });
}

export function createAuditService(db: PrismaClient = defaultPrisma) {
  return {
    async list(user: User, page: number, pageSize: number, entityType?: string, entityId?: string) {
      if (!isAdmin(user)) throw forbidden("Acesso restrito a administradores");
      const where: Prisma.AuditEventWhereInput = {};
      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;
      const [total, items] = await Promise.all([
        db.auditEvent.count({ where }),
        db.auditEvent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { actor: { select: { id: true, email: true, nome: true } } },
        }),
      ]);
      return { items, total, page, pageSize };
    },
  };
}

export const auditService = createAuditService();
