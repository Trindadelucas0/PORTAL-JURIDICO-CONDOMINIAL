import type { DeadlineKind, Prisma, PrismaClient, User } from "@prisma/client";
import { z } from "zod";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import { requireTicketAccess, ticketListWhere } from "@/lib/auth/ticket-access";

export const deadlineCreateSchema = z.object({
  ticketId: z.string().uuid(),
  title: z.string().min(2).max(200),
  dueAt: z.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), "Data inválida"),
  kind: z.enum(["atendimento", "juridico"]),
});

export const deadlinePatchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  dueAt: z.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), "Data inválida").optional(),
  kind: z.enum(["atendimento", "juridico"]).optional(),
  done: z.boolean().optional(),
});

export function createDeadlineService(db: PrismaClient = defaultPrisma) {
  return {
    async list(user: User, page: number, pageSize: number, overdueOnly = false, dueSoon = false) {
      const ticketWhere = ticketListWhere(user);
      const now = new Date();
      const soon = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      const where: Prisma.DeadlineWhereInput = {
        ticket: ticketWhere,
      };
      if (overdueOnly) {
        where.doneAt = null;
        where.dueAt = { lt: now };
      } else if (dueSoon) {
        where.doneAt = null;
        where.dueAt = { gt: now, lte: soon };
      }
      const [total, items] = await Promise.all([
        db.deadline.count({ where }),
        db.deadline.findMany({
          where,
          orderBy: { dueAt: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            ticket: {
              select: { id: true, protocol: true, title: true, assignedToId: true, status: true },
            },
          },
        }),
      ]);
      return { items, total, page, pageSize };
    },

    async countOverdue(user: User) {
      return db.deadline.count({
        where: {
          doneAt: null,
          dueAt: { lt: new Date() },
          ticket: ticketListWhere(user),
        },
      });
    },

    async countDueSoon(user: User) {
      const now = new Date();
      const soon = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      return db.deadline.count({
        where: {
          doneAt: null,
          dueAt: { gt: now, lte: soon },
          ticket: ticketListWhere(user),
        },
      });
    },

    async create(user: User, input: unknown) {
      const data = deadlineCreateSchema.parse(input);
      await requireTicketAccess(user, data.ticketId, db);
      return db.deadline.create({
        data: {
          ticketId: data.ticketId,
          title: data.title,
          dueAt: new Date(data.dueAt),
          kind: data.kind as DeadlineKind,
        },
      });
    },

    async patch(user: User, id: string, input: unknown) {
      const row = await db.deadline.findFirst({ where: { id } });
      if (!row) throw notFound("Prazo não encontrado");
      await requireTicketAccess(user, row.ticketId, db);
      const data = deadlinePatchSchema.parse(input);
      return db.deadline.update({
        where: { id },
        data: {
          title: data.title,
          dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
          kind: data.kind as DeadlineKind | undefined,
          doneAt: data.done === true ? new Date() : data.done === false ? null : undefined,
        },
      });
    },
  };
}

export const deadlineService = createDeadlineService();
