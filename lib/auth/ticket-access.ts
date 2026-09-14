import type { PrismaClient, User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";

const ticketInclude = {
  condominium: true,
  contact: true,
  assignedTo: { select: { id: true, email: true, role: true } },
  createdBy: { select: { id: true, email: true, role: true } },
} as const;

export async function requireTicketAccess(user: User, ticketId: string, db: PrismaClient = defaultPrisma) {
  const ticket = await db.ticket.findFirst({
    where: { id: ticketId },
    include: ticketInclude,
  });
  if (!ticket) throw notFound("Chamado não encontrado");
  if (isAdmin(user)) return ticket;
  if (ticket.assignedToId !== user.id) {
    throw forbidden("Sem permissão para este chamado");
  }
  return ticket;
}

export function ticketListWhere(user: User) {
  if (isAdmin(user)) return {};
  return { assignedToId: user.id };
}
