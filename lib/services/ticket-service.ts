import type { Prisma, PrismaClient, TicketCategory, TicketPriority, TicketStatus, User } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import { z } from "zod";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { requireTicketAccess, ticketListWhere } from "@/lib/auth/ticket-access";
import { writeAudit } from "@/lib/services/audit-service";
import { upsertContactIdentities } from "@/lib/services/contact-identity";

export const ticketCategorySchema = z.enum([
  "cobranca",
  "assembleia",
  "obras",
  "vizinhanca",
  "administrativo",
  "outro",
]);
export const ticketPrioritySchema = z.enum(["baixa", "media", "alta", "urgente"]);
export const ticketStatusSchema = z.enum(["aberto", "em_andamento", "aguardando", "resolvido"]);

const assigneeId = z.string().uuid().optional().nullable();

export const ticketCreateSchema = z.object({
  title: z.string().min(3).max(200),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  condominiumId: z.string().uuid(),
  contactId: z.string().uuid(),
  assignedToId: assigneeId,
});

export const ticketPatchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  category: ticketCategorySchema.optional(),
  assignedToId: assigneeId,
});

export type TicketListFilters = {
  q?: string;
  status?: z.infer<typeof ticketStatusSchema>;
  category?: z.infer<typeof ticketCategorySchema>;
  priority?: z.infer<typeof ticketPrioritySchema>;
  assignedToId?: string;
  unassigned?: boolean;
  condominiumId?: string;
};

const include = {
  condominium: true,
  contact: true,
  assignedTo: { select: { id: true, email: true, nome: true, role: true } },
  createdBy: { select: { id: true, email: true, nome: true, role: true } },
  triageItem: { select: { id: true, status: true } },
  deadlines: {
    where: { doneAt: null },
    orderBy: { dueAt: "asc" as const },
    take: 1,
    select: { dueAt: true, title: true, doneAt: true },
  },
  _count: { select: { documents: true, messages: true } },
} as const;

async function nextProtocol(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const last = await tx.ticket.findFirst({
    where: { protocol: { startsWith: prefix } },
    orderBy: { protocol: "desc" },
    select: { protocol: true },
  });
  const n = last ? Number(last.protocol.slice(prefix.length)) + 1 : 1;
  if (!Number.isFinite(n) || n < 1) throw unprocessable("Não foi possível gerar protocolo");
  return `${prefix}${String(n).padStart(4, "0")}`;
}

async function resolveAssignee(db: PrismaClient, assignedToId: string | null | undefined) {
  if (!assignedToId) return null;
  const assignee = await db.user.findFirst({ where: { id: assignedToId, deletedAt: null, ativo: true } });
  if (!assignee) throw notFound("Responsável não encontrado");
  return assignee;
}

export function createTicketService(db: PrismaClient = defaultPrisma) {
  return {
    async list(user: User, page: number, pageSize: number, filters: TicketListFilters = {}) {
      const access: Prisma.TicketWhereInput = ticketListWhere(user);
      const extra: Prisma.TicketWhereInput[] = [];
      if (filters.q) {
        extra.push({
          OR: [
            { protocol: { contains: filters.q, mode: "insensitive" } },
            { title: { contains: filters.q, mode: "insensitive" } },
            { contact: { nome: { contains: filters.q, mode: "insensitive" } } },
            { condominium: { nome: { contains: filters.q, mode: "insensitive" } } },
          ],
        });
      }
      if (filters.status) extra.push({ status: filters.status });
      if (filters.category) extra.push({ category: filters.category });
      if (filters.priority) extra.push({ priority: filters.priority });
      if (isAdmin(user)) {
        if (filters.unassigned) extra.push({ assignedToId: null });
        else if (filters.assignedToId) extra.push({ assignedToId: filters.assignedToId });
      }
      if (filters.condominiumId) extra.push({ condominiumId: filters.condominiumId });
      const where: Prisma.TicketWhereInput = extra.length ? { AND: [access, ...extra] } : access;
      const [total, rows] = await Promise.all([
        db.ticket.count({ where }),
        db.ticket.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include,
        }),
      ]);
      const items = rows.map(({ deadlines, ...ticket }) => ({
        ...ticket,
        nextDeadline: deadlines[0]
          ? {
              dueAt: deadlines[0].dueAt,
              title: deadlines[0].title,
              doneAt: deadlines[0].doneAt,
            }
          : null,
      }));
      return { items, total, page, pageSize };
    },

    async get(user: User, id: string) {
      await requireTicketAccess(user, id, db);
      const ticket = await db.ticket.findFirst({
        where: { id },
        include: {
          ...include,
          conversation: { include: { connection: true, contact: true } },
          documents: { orderBy: { createdAt: "desc" }, take: 50 },
          deadlines: { orderBy: { dueAt: "asc" } },
          messages: {
            where: { sendStatus: "draft", visibility: "publica" },
            orderBy: { createdAt: "desc" },
            take: 30,
            include: { attachments: true },
          },
        },
      });
      if (!ticket) throw notFound("Chamado não encontrado");
      return ticket;
    },

    async createManual(user: User, input: unknown) {
      if (!isAdmin(user)) throw forbidden("Somente administradores criam chamado manual");
      const data = ticketCreateSchema.parse(input);
      const [condo, contact, assignee] = await Promise.all([
        db.condominium.findFirst({ where: { id: data.condominiumId, deletedAt: null } }),
        db.contact.findFirst({ where: { id: data.contactId, deletedAt: null } }),
        resolveAssignee(db, data.assignedToId),
      ]);
      if (!condo) throw notFound("Condomínio não encontrado");
      if (!contact) throw notFound("Contato não encontrado");
      const connection =
        (await db.channelConnection.findFirst({ where: { type: "dev_mock" } })) ||
        (await db.channelConnection.findFirst({ orderBy: { createdAt: "asc" } }));
      if (!connection) throw unprocessable("Nenhuma conexão para vincular o chamado");
      let conversation = await db.conversation.findFirst({
        where: {
          connectionId: connection.id,
          OR: [{ peerPhoneE164: contact.phoneE164 }, { contactId: contact.id }],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!conversation) {
        try {
          conversation = await db.conversation.create({
            data: {
              contactId: contact.id,
              condominiumId: condo.id,
              connectionId: connection.id,
              unidentified: false,
              peerPhoneE164: contact.phoneE164,
            },
          });
        } catch (error) {
          if (error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002") {
            conversation = await db.conversation.findFirst({
              where: { connectionId: connection.id, peerPhoneE164: contact.phoneE164 },
            });
          } else {
            throw error;
          }
        }
      }
      if (!conversation) throw unprocessable("Não foi possível abrir a conversa do chamado");
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          contactId: contact.id,
          condominiumId: condo.id,
          unidentified: false,
        },
      });
      await upsertContactIdentities(db, contact.id, [contact.phoneE164]);
      const ticket = await db.$transaction(async (tx) => {
        const protocol = await nextProtocol(tx);
        return tx.ticket.create({
          data: {
            protocol,
            title: data.title,
            category: data.category as TicketCategory,
            priority: data.priority as TicketPriority,
            origin: "manual",
            condominiumId: condo.id,
            contactId: contact.id,
            conversationId: conversation.id,
            assignedToId: assignee?.id ?? null,
            createdById: user.id,
            status: "aberto",
          },
          include,
        });
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "ticket.create",
        entityType: "ticket",
        entityId: ticket.id,
        after: { protocol: ticket.protocol, assignedToId: ticket.assignedToId },
      });
      return ticket;
    },

    async patch(user: User, id: string, input: unknown) {
      const ticket = await requireTicketAccess(user, id, db);
      const data = ticketPatchSchema.parse(input);
      if (!isAdmin(user) && data.assignedToId !== undefined && data.assignedToId !== ticket.assignedToId) {
        throw forbidden("Somente administradores reatribuem chamados");
      }
      if (data.assignedToId) {
        await resolveAssignee(db, data.assignedToId);
      }
      const updated = await db.ticket.update({
        where: { id: ticket.id },
        data: {
          title: data.title,
          status: data.status as TicketStatus | undefined,
          priority: data.priority as TicketPriority | undefined,
          category: data.category as TicketCategory | undefined,
          assignedToId: data.assignedToId === undefined ? undefined : data.assignedToId,
        },
        include,
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "ticket.patch",
        entityType: "ticket",
        entityId: ticket.id,
        before: {
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          assignedToId: ticket.assignedToId,
        },
        after: {
          title: updated.title,
          status: updated.status,
          priority: updated.priority,
          category: updated.category,
          assignedToId: updated.assignedToId,
        },
      });
      return updated;
    },

    async promoteFromTriage(
      user: User,
      triageId: string,
      input: {
        category: z.infer<typeof ticketCategorySchema>;
        priority: z.infer<typeof ticketPrioritySchema>;
        assignedToId?: string | null;
      },
    ) {
      if (!isAdmin(user)) throw forbidden();
      const parsed = z
        .object({
          category: ticketCategorySchema,
          priority: ticketPrioritySchema,
          assignedToId: assigneeId,
        })
        .parse(input);

      const item = await db.triageItem.findFirst({
        where: { id: triageId },
        include: { conversation: { include: { contact: true } }, ticket: true },
      });
      if (!item) throw notFound("Item de triagem não encontrado");
      if (item.status === "promovido" && item.ticket) return item.ticket;
      if (item.conversation.unidentified || !item.conversation.contactId) {
        throw unprocessable("Cadastre o contato com condomínio antes de promover a chamado");
      }
      const contact = item.conversation.contact;
      if (!contact?.condominiumId) {
        throw unprocessable("Contato precisa estar vinculado a um condomínio");
      }
      const assignee = await resolveAssignee(db, parsed.assignedToId);

      const title = `${contact.nome} — ${parsed.category}`;
      const ticket = await db.$transaction(async (tx) => {
        const protocol = await nextProtocol(tx);
        const created = await tx.ticket.create({
          data: {
            protocol,
            title,
            category: parsed.category,
            priority: parsed.priority,
            origin: "whatsapp",
            condominiumId: contact.condominiumId!,
            contactId: contact.id,
            conversationId: item.conversationId,
            assignedToId: assignee?.id ?? null,
            createdById: user.id,
            status: "aberto",
          },
          include,
        });
        await tx.triageItem.update({
          where: { id: item.id },
          data: {
            status: "promovido",
            ticketId: created.id,
            category: parsed.category,
            priority: parsed.priority,
          },
        });
        await tx.message.updateMany({
          where: { conversationId: item.conversationId, ticketId: null },
          data: { ticketId: created.id },
        });
        await writeAudit(tx, {
          actorId: user.id,
          action: "triage.promote",
          entityType: "ticket",
          entityId: created.id,
          after: { protocol: created.protocol, triageId: item.id, assignedToId: created.assignedToId },
        });
        return created;
      });
      return ticket;
    },
  };
}

export const ticketService = createTicketService();
