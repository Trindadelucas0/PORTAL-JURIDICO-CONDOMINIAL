import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { conflict, forbidden, notFound } from "@/lib/api/errors";
import { normalizeE164 } from "@/lib/phone/e164";
import { e164LookupValues, isLidPeer, sendableWhatsAppE164, uniquePhones } from "@/lib/phone/identity";
import { enrichConversationPeerProfile, peerAvatarPublicUrl } from "@/lib/services/peer-avatar-service";
import { unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { ticketListWhere } from "@/lib/auth/ticket-access";
import { writeAudit } from "@/lib/services/audit-service";
import { findContactByPhones, upsertContactIdentities } from "@/lib/services/contact-identity";
import { mergeConversations } from "@/lib/services/conversation-merge";
import { inFlowConversationWhere, isInOperationalFlow } from "@/lib/services/operational-flow";
import { resolveUniqueLidPlaceholderForContact } from "@/lib/channels/evolution-lid-map";

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
  phone: z.string().min(8).max(32),
  email: z.string().email().optional().or(z.literal("")),
  cargo: z.string().max(80).optional(),
  condominiumId: z.string().uuid().optional().nullable(),
});

export const contactPatch = z.object({
  nome: z.string().min(2).max(120).optional(),
  phone: z.string().min(8).max(32).optional(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  cargo: z.string().max(80).optional().nullable(),
  condominiumId: z.string().uuid().optional().nullable(),
});

export const enrollConversationSchema = z.object({
  nome: z.string().min(2).max(120),
  condominiumId: z.string().uuid(),
  phone: z.string().min(8).max(32).optional(),
  email: z.string().email().optional().or(z.literal("")),
  cargo: z.string().max(80).optional(),
});

async function openTriageForConversation(conversationId: string) {
  const existing = await prisma.triageItem.findUnique({ where: { conversationId } });
  if (!existing) {
    return prisma.triageItem.create({ data: { conversationId, status: "aberto" } });
  }
  if (existing.status === "arquivado") {
    return prisma.triageItem.update({ where: { id: existing.id }, data: { status: "aberto" } });
  }
  return existing;
}

async function rememberWhatsAppLidIdentity(contactId: string, nome: string) {
  const lid = await resolveUniqueLidPlaceholderForContact(nome);
  if (lid) await upsertContactIdentities(prisma, contactId, [lid]);
}

async function attachContactToMatchingConversations(contact: {
  id: string;
  phoneE164: string;
  condominiumId: string | null;
}) {
  if (!isInOperationalFlow(contact)) return;
  const identities = await prisma.contactIdentity.findMany({ where: { contactId: contact.id } });
  const keys = uniquePhones(
    contact.phoneE164,
    ...e164LookupValues(contact.phoneE164),
    ...identities.map((identity) => identity.value),
  );
  const convs = await prisma.conversation.findMany({
    where: { OR: [{ contactId: contact.id }, { peerPhoneE164: { in: keys } }] },
  });
  for (const conv of convs) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        contactId: contact.id,
        condominiumId: contact.condominiumId,
        unidentified: false,
        ...(isLidPeer(conv.peerPhoneE164) && !isLidPeer(contact.phoneE164)
          ? { peerPhoneE164: contact.phoneE164 }
          : {}),
      },
    });
    await openTriageForConversation(conv.id);
  }
}

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
        include: { _count: { select: { contacts: true, documents: true } } },
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
          deadlines: {
            where: { doneAt: null },
            orderBy: { dueAt: "asc" },
            take: 3,
            select: { id: true, dueAt: true, title: true, doneAt: true },
          },
        },
      }),
      prisma.officeDocument.findMany({
        where: isAdmin(user)
          ? { condominiumId: id }
          : { condominiumId: id, ticket: { assignedToId: user.id } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          originalName: true,
          title: true,
          kind: true,
          purpose: true,
          sizeBytes: true,
          ingestStatus: true,
          storageKey: true,
          ticketId: true,
        },
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
    await rememberWhatsAppLidIdentity(row.id, row.nome);
    await attachContactToMatchingConversations(row);
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
    await rememberWhatsAppLidIdentity(id, row.nome);
    if (data.condominiumId !== undefined || data.phone || data.nome) {
      await prisma.conversation.updateMany({
        where: { contactId: id },
        data: { condominiumId: row.condominiumId },
      });
      await attachContactToMatchingConversations(row);
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
    return {
      ...item,
      conversation: {
        ...item.conversation,
        peerAvatarUrl:
          peerAvatarPublicUrl(item.conversation.peerAvatarKey) ||
          peerAvatarPublicUrl(item.conversation.contact?.avatarKey),
      },
    };
  },

  async listTriage(page: number, pageSize: number) {
    const where = {
      status: "aberto" as const,
      conversation: inFlowConversationWhere,
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
    return {
      items: items.map((item) => ({
        ...item,
        conversation: {
          ...item.conversation,
          peerAvatarUrl:
            peerAvatarPublicUrl(item.conversation.peerAvatarKey) ||
            peerAvatarPublicUrl(item.conversation.contact?.avatarKey),
        },
      })),
      total,
      page,
      pageSize,
    };
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
    if (input.action === "identify" || input.action === "linkCondominium") {
      throw unprocessable("Cadastre o contato no condomínio ou em Não vinculados. A triagem não identifica de novo.");
    }
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
    throw unprocessable("Cadastre o contato no condomínio ou em Não vinculados. A triagem não identifica de novo.");
  },

  async enrollConversation(actor: User, conversationId: string, input: unknown) {
    if (!isAdmin(actor)) throw forbidden("Somente administradores cadastram no fluxo");
    const data = enrollConversationSchema.parse(input);
    let conversation = await prisma.conversation.findFirst({ where: { id: conversationId } });
    if (!conversation) throw notFound("Conversa não encontrada");
    const condo = await prisma.condominium.findFirst({ where: { id: data.condominiumId, deletedAt: null } });
    if (!condo) throw notFound("Condomínio não encontrado");

    if (isLidPeer(conversation.peerPhoneE164)) {
      const enriched = await enrichConversationPeerProfile(conversation.id, prisma);
      conversation =
        (await prisma.conversation.findFirst({ where: { id: enriched.conversationId } })) ?? conversation;
    }

    const whatsappPhone = sendableWhatsAppE164({ peerPhoneE164: conversation.peerPhoneE164 });
    const rawPhone = whatsappPhone || data.phone?.trim() || "";
    const phoneE164 = normalizeE164(rawPhone);
    if (!phoneE164 || isLidPeer(phoneE164)) {
      throw unprocessable("Informe um telefone real para cadastrar no fluxo");
    }

    const lookup = uniquePhones(phoneE164, conversation.peerPhoneE164, ...e164LookupValues(phoneE164));
    let contact = await findContactByPhones(prisma, lookup);
    if (contact) {
      const previousPhone = contact.phoneE164;
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          nome: data.nome,
          phoneE164,
          email: data.email ? data.email : undefined,
          cargo: data.cargo ? data.cargo : undefined,
          condominiumId: condo.id,
          avatarKey: conversation.peerAvatarKey || contact.avatarKey,
        },
      });
      await upsertContactIdentities(
        prisma,
        contact.id,
        uniquePhones(...lookup, previousPhone, ...e164LookupValues(previousPhone)),
      );
    } else {
      const taken = await prisma.contact.findFirst({ where: { phoneE164, deletedAt: null } });
      if (taken) {
        const previousPhone = taken.phoneE164;
        contact = await prisma.contact.update({
          where: { id: taken.id },
          data: {
            nome: data.nome,
            phoneE164,
            email: data.email ? data.email : undefined,
            cargo: data.cargo ? data.cargo : undefined,
            condominiumId: condo.id,
            avatarKey: conversation.peerAvatarKey || taken.avatarKey,
          },
        });
        await upsertContactIdentities(
          prisma,
          contact.id,
          uniquePhones(...lookup, previousPhone, ...e164LookupValues(previousPhone)),
        );
      } else {
        contact = await prisma.contact.create({
          data: {
            nome: data.nome,
            phoneE164,
            email: data.email || null,
            cargo: data.cargo || null,
            condominiumId: condo.id,
            avatarKey: conversation.peerAvatarKey || null,
          },
        });
        await upsertContactIdentities(prisma, contact.id, lookup);
      }
    }

    await rememberWhatsAppLidIdentity(contact.id, contact.nome);
    const identities = await prisma.contactIdentity.findMany({ where: { contactId: contact.id } });
    const mergeKeys = uniquePhones(...lookup, ...identities.map((identity) => identity.value));
    const others = await prisma.conversation.findMany({
      where: {
        connectionId: conversation.connectionId,
        id: { not: conversation.id },
        OR: [{ contactId: contact.id }, { peerPhoneE164: { in: mergeKeys } }],
      },
    });
    for (const extra of others) {
      await mergeConversations(prisma, conversation.id, extra.id);
    }
    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        contactId: contact.id,
        condominiumId: condo.id,
        unidentified: false,
        ...(isLidPeer(conversation.peerPhoneE164) ? { peerPhoneE164: phoneE164 } : {}),
      },
      include: { contact: true, condominium: true },
    });
    const triage = await openTriageForConversation(conversation.id);
    await writeAudit(prisma, {
      actorId: actor.id,
      action: "conversation.enroll",
      entityType: "conversation",
      entityId: conversation.id,
      after: { contactId: contact.id, condominiumId: condo.id, triageId: triage.id },
    });
    return { conversation: updated, contact, triage };
  },

  async relinkWhatsAppLidsForInFlowContacts() {
    const contacts = await prisma.contact.findMany({
      where: { deletedAt: null, condominiumId: { not: null } },
    });
    for (const contact of contacts) {
      await rememberWhatsAppLidIdentity(contact.id, contact.nome);
      await attachContactToMatchingConversations(contact);
    }
    return { scanned: contacts.length };
  },
};
