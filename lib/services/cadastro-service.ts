import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { conflict, forbidden, notFound } from "@/lib/api/errors";
import { normalizeE164 } from "@/lib/phone/e164";
import { e164LookupValues, uniquePhones } from "@/lib/phone/identity";
import { unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { ticketListWhere } from "@/lib/auth/ticket-access";
import { writeAudit } from "@/lib/services/audit-service";
import { upsertContactIdentities } from "@/lib/services/contact-identity";
import { mergeConversations } from "@/lib/services/conversation-merge";

const cnpjSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || v.length === 14, "CNPJ deve ter 14 dígitos")
  .optional();

export const condominiumCreate = z.object({
  nome: z.string().min(2).max(120),
  cnpj: cnpjSchema,
  endereco: z.string().max(200).optional(),
  cidadeUf: z.string().max(80).optional(),
  observacao: z.string().max(2000).optional(),
});

export const condominiumPatch = condominiumCreate.partial().extend({
  nome: z.string().min(2).max(120).optional(),
});

export const contactCreate = z.object({
  nome: z.string().min(2).max(120),
  phone: z.string().min(8).max(20),
  email: z.string().email().optional().or(z.literal("")),
  cargo: z.string().max(80).optional(),
  condominiumId: z.string().uuid().optional().nullable(),
});

export const contactPatch = z.object({
  nome: z.string().min(2).max(120).optional(),
  phone: z.string().min(8).max(20).optional(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  cargo: z.string().max(80).optional().nullable(),
  condominiumId: z.string().uuid().optional().nullable(),
});

export const cadastroService = {
  async listCondominiums(page: number, pageSize: number) {
    const where = { deletedAt: null };
    const [total, items] = await Promise.all([
      prisma.condominium.count({ where }),
      prisma.condominium.findMany({
        where,
        orderBy: { nome: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { contacts: true } } },
      }),
    ]);
    return { items, total, page, pageSize };
  },

  async getCondominium(user: User, id: string) {
    const condo = await prisma.condominium.findFirst({
      where: { id, deletedAt: null },
      include: {
        contacts: { where: { deletedAt: null }, orderBy: { nome: "asc" } },
      },
    });
    if (!condo) throw notFound("Condomínio não encontrado");
    const ticketWhere = { condominiumId: id, ...ticketListWhere(user) };
    const [tickets, documents, conversations] = await Promise.all([
      prisma.ticket.findMany({
        where: ticketWhere,
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          protocol: true,
          title: true,
          status: true,
          priority: true,
          assignedTo: { select: { id: true, email: true, nome: true } },
        },
      }),
      prisma.officeDocument.findMany({
        where: isAdmin(user)
          ? { condominiumId: id }
          : { condominiumId: id, ticket: { assignedToId: user.id } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, originalName: true, sizeBytes: true, ingestStatus: true, storageKey: true, ticketId: true },
      }),
      prisma.conversation.findMany({
        where: isAdmin(user)
          ? { condominiumId: id }
          : { condominiumId: id, tickets: { some: { assignedToId: user.id } } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          contact: { select: { nome: true, phoneE164: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
        },
      }),
    ]);
    return { ...condo, tickets, documents, conversations };
  },

  async createCondominium(actorId: string, input: unknown) {
    const data = condominiumCreate.parse(input);
    const row = await prisma.condominium.create({
      data: {
        nome: data.nome,
        cnpj: data.cnpj || null,
        endereco: data.endereco || null,
        cidadeUf: data.cidadeUf || null,
        observacao: data.observacao || null,
      },
    });
    await writeAudit(prisma, { actorId, action: "condominium.create", entityType: "condominium", entityId: row.id, after: row });
    return row;
  },

  async patchCondominium(user: User, id: string, input: unknown) {
    if (!isAdmin(user)) throw forbidden("Somente administradores editam o cadastro");
    const existing = await prisma.condominium.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound("Condomínio não encontrado");
    const data = condominiumPatch.parse(input);
    const row = await prisma.condominium.update({
      where: { id },
      data: {
        nome: data.nome,
        cnpj: data.cnpj === undefined ? undefined : data.cnpj || null,
        endereco: data.endereco,
        cidadeUf: data.cidadeUf,
        observacao: data.observacao,
      },
    });
    await writeAudit(prisma, {
      actorId: user.id,
      action: "condominium.patch",
      entityType: "condominium",
      entityId: id,
      before: existing,
      after: row,
    });
    return row;
  },

  async listContacts(page: number, pageSize: number) {
    const where = { deletedAt: null };
    const [total, items] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { nome: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { condominium: true },
      }),
    ]);
    return { items, total, page, pageSize };
  },

  async createContact(input: unknown) {
    const data = contactCreate.parse(input);
    const phoneE164 = normalizeE164(data.phone);
    if (!phoneE164) throw unprocessable("Telefone deve ser E.164 válido");
    const exists = await prisma.contact.findFirst({ where: { phoneE164 } });
    if (exists && !exists.deletedAt) throw conflict("Já existe contato com este telefone");
    const row = await prisma.contact.create({
      data: {
        nome: data.nome,
        phoneE164,
        email: data.email || null,
        cargo: data.cargo || null,
        condominiumId: data.condominiumId || null,
      },
      include: { condominium: true },
    });
    await upsertContactIdentities(prisma, row.id, [phoneE164, ...e164LookupValues(phoneE164)]);
    return row;
  },

  async patchContact(user: User, id: string, input: unknown) {
    if (!isAdmin(user)) throw forbidden("Somente administradores editam contato");
    const existing = await prisma.contact.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound("Contato não encontrado");
    const data = contactPatch.parse(input);
    let phoneE164 = existing.phoneE164;
    if (data.phone) {
      const next = normalizeE164(data.phone);
      if (!next) throw unprocessable("Telefone deve ser E.164 válido");
      if (next !== existing.phoneE164) {
        const taken = await prisma.contact.findFirst({ where: { phoneE164: next, id: { not: id }, deletedAt: null } });
        if (taken) throw conflict("Já existe contato com este telefone");
      }
      phoneE164 = next;
    }
    const row = await prisma.contact.update({
      where: { id },
      data: {
        nome: data.nome,
        phoneE164,
        email: data.email === undefined ? undefined : data.email || null,
        cargo: data.cargo === undefined ? undefined : data.cargo,
        condominiumId: data.condominiumId === undefined ? undefined : data.condominiumId,
      },
      include: { condominium: true },
    });
    await upsertContactIdentities(prisma, id, [phoneE164, ...e164LookupValues(phoneE164)]);
    if (data.condominiumId !== undefined) {
      await prisma.conversation.updateMany({
        where: { contactId: id },
        data: { condominiumId: data.condominiumId },
      });
    }
    await writeAudit(prisma, {
      actorId: user.id,
      action: "contact.patch",
      entityType: "contact",
      entityId: id,
      before: existing,
      after: row,
    });
    return row;
  },

  async getTriage(id: string) {
    const item = await prisma.triageItem.findFirst({
      where: { id },
      include: {
        conversation: {
          include: {
            contact: true,
            condominium: true,
            messages: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        },
      },
    });
    if (!item) throw notFound("Item de triagem não encontrado");
    return item;
  },

  async listTriage(page: number, pageSize: number, unidentified?: boolean) {
    const where = {
      status: "aberto" as const,
      ...(unidentified ? { conversation: { unidentified: true } } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.triageItem.count({ where }),
      prisma.triageItem.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          conversation: {
            include: {
              contact: true,
              condominium: true,
              messages: { orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      }),
    ]);
    return { items, total, page, pageSize };
  },

  async patchTriage(
    actor: User,
    id: string,
    input: { action: "archive" } | { action: "identify"; contactId: string } | { action: "linkCondominium"; condominiumId: string },
  ) {
    const item = await prisma.triageItem.findFirst({
      where: { id },
      include: { conversation: { include: { contact: true } } },
    });
    if (!item) throw notFound("Item de triagem não encontrado");
    if (input.action === "archive") {
      const row = await prisma.triageItem.update({
        where: { id },
        data: { status: "arquivado" },
      });
      await writeAudit(prisma, {
        actorId: actor.id,
        action: "triage.archive",
        entityType: "triage",
        entityId: id,
        before: { status: item.status },
        after: { status: "arquivado" },
      });
      return row;
    }
    if (input.action === "linkCondominium") {
      const condo = await prisma.condominium.findFirst({ where: { id: input.condominiumId, deletedAt: null } });
      if (!condo) throw notFound("Condomínio não encontrado");
      if (!item.conversation.contactId) {
        throw unprocessable("Identifique o contato antes de vincular o condomínio");
      }
      await prisma.$transaction([
        prisma.contact.update({
          where: { id: item.conversation.contactId },
          data: { condominiumId: condo.id },
        }),
        prisma.conversation.update({
          where: { id: item.conversationId },
          data: { condominiumId: condo.id },
        }),
      ]);
      await writeAudit(prisma, {
        actorId: actor.id,
        action: "triage.link_condominium",
        entityType: "triage",
        entityId: id,
        after: { condominiumId: condo.id, contactId: item.conversation.contactId },
      });
      return prisma.triageItem.findFirst({
        where: { id },
        include: { conversation: { include: { contact: true, condominium: true } } },
      });
    }
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, deletedAt: null },
    });
    if (!contact) throw notFound("Contato não encontrado");
    const peerKeys = uniquePhones(
      item.conversation.peerPhoneE164,
      contact.phoneE164,
      ...e164LookupValues(contact.phoneE164),
    );
    await upsertContactIdentities(prisma, contact.id, peerKeys);
    const others = await prisma.conversation.findMany({
      where: {
        connectionId: item.conversation.connectionId,
        id: { not: item.conversationId },
        OR: [{ contactId: contact.id }, { peerPhoneE164: { in: peerKeys } }],
      },
    });
    for (const extra of others) {
      await mergeConversations(prisma, item.conversationId, extra.id);
    }
    await prisma.conversation.update({
      where: { id: item.conversationId },
      data: {
        contactId: contact.id,
        condominiumId: contact.condominiumId,
        unidentified: false,
      },
    });
    await writeAudit(prisma, {
      actorId: actor.id,
      action: "triage.identify",
      entityType: "triage",
      entityId: id,
      after: { contactId: contact.id, condominiumId: contact.condominiumId },
    });
    return prisma.triageItem.findFirst({
      where: { id },
      include: { conversation: { include: { contact: true, condominium: true } } },
    });
  },
};
