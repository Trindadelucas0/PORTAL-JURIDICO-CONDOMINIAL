import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { conflict, notFound } from "@/lib/api/errors";
import { normalizeE164 } from "@/lib/phone/e164";
import { unprocessable } from "@/lib/api/errors";

export const condominiumCreate = z.object({
  nome: z.string().min(2).max(120),
});

export const contactCreate = z.object({
  nome: z.string().min(2).max(120),
  phone: z.string().min(8).max(20),
  email: z.string().email().optional().or(z.literal("")),
  cargo: z.string().max(80).optional(),
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

  async createCondominium(input: unknown) {
    const data = condominiumCreate.parse(input);
    return prisma.condominium.create({ data: { nome: data.nome } });
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
    return prisma.contact.create({
      data: {
        nome: data.nome,
        phoneE164,
        email: data.email || null,
        cargo: data.cargo || null,
        condominiumId: data.condominiumId || null,
      },
      include: { condominium: true },
    });
  },

  async listTriage(page: number, pageSize: number) {
    const where = { status: "aberto" as const };
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
    id: string,
    input: { action: "archive" } | { action: "identify"; contactId: string },
  ) {
    const item = await prisma.triageItem.findFirst({ where: { id } });
    if (!item) throw notFound("Item de triagem não encontrado");
    if (input.action === "archive") {
      return prisma.triageItem.update({
        where: { id },
        data: { status: "arquivado" },
      });
    }
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, deletedAt: null },
    });
    if (!contact) throw notFound("Contato não encontrado");
    await prisma.conversation.update({
      where: { id: item.conversationId },
      data: {
        contactId: contact.id,
        condominiumId: contact.condominiumId,
        unidentified: false,
      },
    });
    return prisma.triageItem.findFirst({
      where: { id },
      include: { conversation: { include: { contact: true, condominium: true } } },
    });
  },
};
