import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { conflict, forbidden, notFound } from "@/lib/api/errors";
import { normalizeE164 } from "@/lib/phone/e164";
import { e164LookupValues, isLidPeer, sendableWhatsAppE164, uniquePhones } from "@/lib/phone/identity";
import { peerAvatarPublicUrl } from "@/lib/services/peer-avatar-service";
import { unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { staffAssignedCondoIds, ticketListWhere } from "@/lib/auth/ticket-access";
import { writeAudit } from "@/lib/services/audit-service";
import { findContactByPhones, upsertContactIdentities } from "@/lib/services/contact-identity";
import { mergeConversations } from "@/lib/services/conversation-merge";
import { inFlowConversationWhere, isInOperationalFlow } from "@/lib/services/operational-flow";
import { resolveUniqueLidPlaceholderForContact } from "@/lib/channels/evolution-lid-map";

type Db = typeof prisma | Prisma.TransactionClient;

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
  condominiumIds: z.array(z.string().uuid()).optional(),
});

export const contactPatch = z.object({
  nome: z.string().min(2).max(120).optional(),
  phone: z.string().min(8).max(32).optional(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  cargo: z.string().max(80).optional().nullable(),
  condominiumId: z.string().uuid().optional().nullable(),
  condominiumIds: z.array(z.string().uuid()).optional(),
});

export const enrollConversationSchema = z.object({
  nome: z.string().min(2).max(120),
  condominiumId: z.string().uuid(),
  condominiumIds: z.array(z.string().uuid()).optional(),
  contactId: z.string().uuid().optional(),
  phone: z.string().min(8).max(32).optional(),
  email: z.string().email().optional().or(z.literal("")),
  cargo: z.string().max(80).optional(),
});

function enrollIdentityPhone(conversation: { peerPhoneE164: string }, typedPhone?: string): string | null {
  const fromPeer = sendableWhatsAppE164({ peerPhoneE164: conversation.peerPhoneE164 });
  if (fromPeer) return fromPeer;
  if (conversation.peerPhoneE164) return conversation.peerPhoneE164;
  if (typedPhone?.trim()) return normalizeE164(typedPhone) || typedPhone.trim();
  return null;
}

function nextContactPhone(existing: string, identity: string): string {
  if (isLidPeer(identity) && !isLidPeer(existing)) return existing;
  if (!isLidPeer(identity) && isLidPeer(existing)) return identity;
  return existing;
}

const contactWithMemberships = {
  condominium: true,
  memberships: {
    include: { condominium: { select: { id: true, nome: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function assertCondominiumsExist(db: Db, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const found = await db.condominium.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== unique.length) throw notFound("Condomínio não encontrado");
}

/** Resolve principal + lista de vínculos. create/patch: replace=true. enroll: replace=false (só soma). */
function resolveMembershipInput(opts: {
  existingPrimary: string | null;
  existingIds: string[];
  condominiumId?: string | null;
  condominiumIds?: string[];
  replace: boolean;
}): { primary: string | null; ids: string[] } {
  const hasPrimary = opts.condominiumId !== undefined;
  const hasList = opts.condominiumIds !== undefined;

  if (!hasPrimary && !hasList) {
    return { primary: opts.existingPrimary, ids: opts.existingIds };
  }

  let ids: string[];
  if (hasList) {
    ids = [...new Set(opts.condominiumIds!)];
  } else if (opts.replace) {
    ids = opts.condominiumId ? [opts.condominiumId] : [];
  } else {
    ids = [...new Set([...opts.existingIds, ...(opts.condominiumId ? [opts.condominiumId] : [])])];
  }

  let primary: string | null;
  if (hasPrimary) {
    primary = opts.condominiumId ?? null;
  } else if (opts.existingPrimary && ids.includes(opts.existingPrimary)) {
    primary = opts.existingPrimary;
  } else {
    primary = ids[0] ?? null;
  }

  if (primary && !ids.includes(primary)) {
    throw unprocessable("O condomínio principal precisa estar na lista de vínculos");
  }
  if (!primary && ids.length > 0) {
    throw unprocessable("Escolha o condomínio principal");
  }

  return { primary, ids };
}

async function syncContactMemberships(
  db: Db,
  contactId: string,
  membership: { primary: string | null; ids: string[] },
  opts: { replace: boolean },
) {
  await assertCondominiumsExist(db, membership.ids);
  if (opts.replace) {
    await db.contactCondominium.deleteMany({
      where: {
        contactId,
        ...(membership.ids.length ? { condominiumId: { notIn: membership.ids } } : {}),
      },
    });
  }
  for (const condominiumId of membership.ids) {
    await db.contactCondominium.upsert({
      where: { contactId_condominiumId: { contactId, condominiumId } },
      create: { contactId, condominiumId },
      update: {},
    });
  }
}

async function openTriageForConversation(db: Db, conversationId: string) {
  const existing = await db.triageItem.findUnique({ where: { conversationId } });
  if (!existing) {
    return db.triageItem.create({ data: { conversationId, status: "aberto" } });
  }
  if (existing.status === "arquivado") {
    return db.triageItem.update({ where: { id: existing.id }, data: { status: "aberto" } });
  }
  return existing;
}

async function rememberWhatsAppLidIdentity(db: Db, contactId: string, nome: string) {
  const lid = await resolveUniqueLidPlaceholderForContact(nome);
  if (lid) await upsertContactIdentities(db, contactId, [lid]);
}

async function attachContactToMatchingConversations(
  db: Db,
  contact: { id: string; phoneE164: string; condominiumId: string | null },
) {
  if (!isInOperationalFlow(contact)) {
    await db.conversation.updateMany({
      where: { contactId: contact.id },
      data: { condominiumId: null },
    });
    return;
  }
  const identities = await db.contactIdentity.findMany({ where: { contactId: contact.id } });
  const keys = uniquePhones(
    contact.phoneE164,
    ...e164LookupValues(contact.phoneE164),
    ...identities.map((identity) => identity.value),
  );
  const convs = await db.conversation.findMany({
    where: {
      OR: [{ contactId: contact.id }, { peerPhoneE164: { in: keys } }, { peerLid: { in: keys } }],
    },
  });
  for (const conv of convs) {
    const promote = isLidPeer(conv.peerPhoneE164) && !isLidPeer(contact.phoneE164);
    try {
      await db.conversation.update({
        where: { id: conv.id },
        data: {
          contactId: contact.id,
          condominiumId: contact.condominiumId,
          unidentified: false,
          ...(promote
            ? { peerPhoneE164: contact.phoneE164, peerLid: conv.peerLid ?? conv.peerPhoneE164 }
            : {}),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const rival = await db.conversation.findFirst({
        where: {
          connectionId: conv.connectionId,
          peerPhoneE164: contact.phoneE164,
          id: { not: conv.id },
        },
      });
      if (!rival) throw conflict("Já existe conversa com este telefone nesta conexão");
      await mergeConversations(db, rival.id, conv.id);
      await db.conversation.update({
        where: { id: rival.id },
        data: {
          contactId: contact.id,
          condominiumId: contact.condominiumId,
          unidentified: false,
        },
      });
      await openTriageForConversation(db, rival.id);
      continue;
    }
    await openTriageForConversation(db, conv.id);
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
        include: { _count: { select: { memberships: true, documents: true } } },
      }),
    ]);
    return {
      items: items.map((row) => ({
        ...row,
        _count: { contacts: row._count.memberships, documents: row._count.documents },
      })),
      total,
      page,
      pageSize,
    };
  },

  async getCondominium(user: User, id: string) {
    const condo = await prisma.condominium.findFirst({
      where: { id, deletedAt: null },
    });
    if (!condo) throw notFound("Condomínio não encontrado");

    const assignedIds = isAdmin(user) ? null : await staffAssignedCondoIds(user.id);
    const contacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [{ condominiumId: id }, { memberships: { some: { condominiumId: id } } }],
        ...(assignedIds
          ? {
              AND: [
                {
                  OR: [
                    { condominiumId: { in: assignedIds } },
                    { memberships: { some: { condominiumId: { in: assignedIds } } } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: { nome: "asc" },
      include: {
        memberships: {
          include: { condominium: { select: { id: true, nome: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const contactsWithCount = contacts.map((ct) => ({
      ...ct,
      membershipCount: Math.max(ct.memberships.length, ct.condominiumId ? 1 : 0),
    }));

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
    return { ...condo, contacts: contactsWithCount, tickets, documents, conversations };
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

  async listContacts(user: User, page: number, pageSize: number, filters: { condominiumId?: string } = {}) {
    const assignedIds = isAdmin(user) ? null : await staffAssignedCondoIds(user.id);
    if (assignedIds && assignedIds.length === 0) return { items: [], total: 0, page, pageSize };
    const where: Prisma.ContactWhereInput = {
      deletedAt: null,
      AND: [
        assignedIds
          ? {
              OR: [
                { condominiumId: { in: assignedIds } },
                { memberships: { some: { condominiumId: { in: assignedIds } } } },
              ],
            }
          : {},
        filters.condominiumId
          ? {
              OR: [
                { condominiumId: filters.condominiumId },
                { memberships: { some: { condominiumId: filters.condominiumId } } },
              ],
            }
          : {},
      ],
    };
    const [total, items] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { nome: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: contactWithMemberships,
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

    const membership = resolveMembershipInput({
      existingPrimary: null,
      existingIds: [],
      condominiumId: data.condominiumId,
      condominiumIds: data.condominiumIds,
      replace: true,
    });

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: {
          nome: data.nome,
          phoneE164,
          email: data.email || null,
          cargo: data.cargo || null,
          condominiumId: membership.primary,
        },
      });
      await syncContactMemberships(tx, created.id, membership, { replace: true });
      await upsertContactIdentities(tx, created.id, [phoneE164, ...e164LookupValues(phoneE164)]);
      await rememberWhatsAppLidIdentity(tx, created.id, created.nome);
      await attachContactToMatchingConversations(tx, created);
      return tx.contact.findFirstOrThrow({
        where: { id: created.id },
        include: contactWithMemberships,
      });
    });
    return row;
  },

  async patchContact(user: User, id: string, input: unknown) {
    if (!isAdmin(user)) throw forbidden("Somente administradores editam contato");
    const existing = await prisma.contact.findFirst({
      where: { id, deletedAt: null },
      include: { memberships: true },
    });
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

    const membershipTouched = data.condominiumId !== undefined || data.condominiumIds !== undefined;
    const membership = resolveMembershipInput({
      existingPrimary: existing.condominiumId,
      existingIds: existing.memberships.map((m) => m.condominiumId),
      condominiumId: data.condominiumId,
      condominiumIds: data.condominiumIds,
      replace: true,
    });

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.contact.update({
        where: { id },
        data: {
          nome: data.nome,
          phoneE164,
          email: data.email === undefined ? undefined : data.email || null,
          cargo: data.cargo === undefined ? undefined : data.cargo,
          ...(membershipTouched ? { condominiumId: membership.primary } : {}),
        },
      });
      if (membershipTouched) {
        await syncContactMemberships(tx, id, membership, { replace: true });
      }
      await upsertContactIdentities(tx, id, [phoneE164, ...e164LookupValues(phoneE164)]);
      await rememberWhatsAppLidIdentity(tx, id, updated.nome);
      if (membershipTouched || data.phone || data.nome) {
        await tx.conversation.updateMany({
          where: { contactId: id },
          data: { condominiumId: updated.condominiumId },
        });
        await attachContactToMatchingConversations(tx, updated);
      }
      return tx.contact.findFirstOrThrow({
        where: { id },
        include: contactWithMemberships,
      });
    });

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
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId } });
    if (!conversation) throw notFound("Conversa não encontrada");
    const condo = await prisma.condominium.findFirst({ where: { id: data.condominiumId, deletedAt: null } });
    if (!condo) throw notFound("Condomínio não encontrado");

    const phoneE164 = enrollIdentityPhone(conversation, data.phone);
    if (!phoneE164) {
      throw unprocessable("Conversa sem identidade para cadastrar");
    }

    const lookup = uniquePhones(phoneE164, conversation.peerPhoneE164, conversation.peerLid, ...e164LookupValues(phoneE164));
    const conversationIdFixed = conversation.id;
    const connectionId = conversation.connectionId;
    const peerLid = conversation.peerLid;
    const wasLidPeer = isLidPeer(conversation.peerPhoneE164);
    const peerAvatarKey = conversation.peerAvatarKey;

    try {
      const result = await prisma.$transaction(async (tx) => {
        let contact = data.contactId
          ? await tx.contact.findFirst({ where: { id: data.contactId, deletedAt: null } })
          : await findContactByPhones(tx, lookup);
        if (data.contactId && !contact) throw notFound("Contato não encontrado");
        if (contact) {
          const previousPhone = contact.phoneE164;
          const storedPhone = nextContactPhone(previousPhone, phoneE164);
          if (!isLidPeer(previousPhone) && !isLidPeer(phoneE164) && storedPhone !== phoneE164) {
            const variants = uniquePhones(...e164LookupValues(previousPhone), ...e164LookupValues(phoneE164));
            if (!variants.includes(phoneE164) || !variants.includes(previousPhone)) {
              throw conflict("Já existe conversa ou contato com este telefone");
            }
          }
          const existingMemberships = await tx.contactCondominium.findMany({ where: { contactId: contact.id } });
          const membership = resolveMembershipInput({
            existingPrimary: contact.condominiumId,
            existingIds: existingMemberships.map((m) => m.condominiumId),
            condominiumId: data.condominiumId,
            condominiumIds: data.condominiumIds,
            replace: false,
          });
          contact = await tx.contact.update({
            where: { id: contact.id },
            data: {
              nome: data.nome,
              phoneE164: storedPhone,
              email: data.email ? data.email : undefined,
              cargo: data.cargo ? data.cargo : undefined,
              condominiumId: membership.primary,
              avatarKey: peerAvatarKey || contact.avatarKey,
            },
          });
          await syncContactMemberships(tx, contact.id, membership, { replace: false });
          await upsertContactIdentities(
            tx,
            contact.id,
            uniquePhones(...lookup, previousPhone, storedPhone, ...e164LookupValues(previousPhone)),
          );
        } else {
          const taken = await tx.contact.findFirst({ where: { phoneE164, deletedAt: null } });
          if (taken) {
            const previousPhone = taken.phoneE164;
            const storedPhone = nextContactPhone(previousPhone, phoneE164);
            const existingMemberships = await tx.contactCondominium.findMany({ where: { contactId: taken.id } });
            const membership = resolveMembershipInput({
              existingPrimary: taken.condominiumId,
              existingIds: existingMemberships.map((m) => m.condominiumId),
              condominiumId: data.condominiumId,
              condominiumIds: data.condominiumIds,
              replace: false,
            });
            contact = await tx.contact.update({
              where: { id: taken.id },
              data: {
                nome: data.nome,
                phoneE164: storedPhone,
                email: data.email ? data.email : undefined,
                cargo: data.cargo ? data.cargo : undefined,
                condominiumId: membership.primary,
                avatarKey: peerAvatarKey || taken.avatarKey,
              },
            });
            await syncContactMemberships(tx, contact.id, membership, { replace: false });
            await upsertContactIdentities(
              tx,
              contact.id,
              uniquePhones(...lookup, previousPhone, storedPhone, ...e164LookupValues(previousPhone)),
            );
          } else {
            const membership = resolveMembershipInput({
              existingPrimary: null,
              existingIds: [],
              condominiumId: data.condominiumId,
              condominiumIds: data.condominiumIds,
              replace: true,
            });
            contact = await tx.contact.create({
              data: {
                nome: data.nome,
                phoneE164,
                email: data.email || null,
                cargo: data.cargo || null,
                condominiumId: membership.primary,
                avatarKey: peerAvatarKey || null,
              },
            });
            await syncContactMemberships(tx, contact.id, membership, { replace: true });
            await upsertContactIdentities(tx, contact.id, lookup);
          }
        }

        await rememberWhatsAppLidIdentity(tx, contact.id, contact.nome);
        const identities = await tx.contactIdentity.findMany({ where: { contactId: contact.id } });
        const mergeKeys = uniquePhones(...lookup, ...identities.map((identity) => identity.value));
        const others = await tx.conversation.findMany({
          where: {
            connectionId,
            id: { not: conversationIdFixed },
            OR: [{ contactId: contact.id }, { peerPhoneE164: { in: mergeKeys } }, { peerLid: { in: mergeKeys } }],
          },
        });
        let keeperId = conversationIdFixed;
        for (const extra of others) {
          keeperId = await mergeConversations(tx, keeperId, extra.id);
        }

        let updated;
        try {
          updated = await tx.conversation.update({
            where: { id: keeperId },
            data: {
              contactId: contact.id,
              condominiumId: condo.id,
              unidentified: false,
              ...(wasLidPeer && !isLidPeer(contact.phoneE164)
                ? { peerPhoneE164: contact.phoneE164, peerLid: peerLid ?? conversation.peerPhoneE164 }
                : {}),
            },
            include: { contact: true, condominium: true },
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          const rival = await tx.conversation.findFirst({
            where: {
              connectionId,
              peerPhoneE164: phoneE164,
              id: { not: keeperId },
            },
          });
          if (!rival) {
            throw conflict("Já existe conversa com este telefone nesta conexão");
          }
          keeperId = await mergeConversations(tx, rival.id, keeperId);
          updated = await tx.conversation.update({
            where: { id: keeperId },
            data: {
              contactId: contact.id,
              condominiumId: condo.id,
              unidentified: false,
            },
            include: { contact: true, condominium: true },
          });
        }

        const triage = await openTriageForConversation(tx, keeperId);
        return { conversation: updated, contact, triage };
      });

      await writeAudit(prisma, {
        actorId: actor.id,
        action: "conversation.enroll",
        entityType: "conversation",
        entityId: result.conversation.id,
        after: {
          contactId: result.contact.id,
          condominiumId: condo.id,
          triageId: result.triage.id,
        },
      });
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict("Já existe conversa ou contato com este telefone");
      }
      throw error;
    }
  },

  async relinkWhatsAppLidsForInFlowContacts() {
    const contacts = await prisma.contact.findMany({
      where: { deletedAt: null, condominiumId: { not: null } },
    });
    for (const contact of contacts) {
      await rememberWhatsAppLidIdentity(prisma, contact.id, contact.nome);
      await attachContactToMatchingConversations(prisma, contact);
    }
    return { scanned: contacts.length };
  },
};
