import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { cadastroService } from "@/lib/services/cadastro-service";
import { createTicketService } from "@/lib/services/ticket-service";
import { hashPassword } from "@/lib/auth/session";
import { assertNotOfficeDatabase } from "./assert-not-office-db";

const db = new PrismaClient();
const tickets = createTicketService(db);

describe("contato em vários condomínios", () => {
  beforeAll(async () => {
    await db.$connect();
    await assertNotOfficeDatabase(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("patch move o principal e soma vínculos; desmarcar todos sai do fluxo", async () => {
    const suffix = `${Date.now()}`;
    const admin = await db.user.create({
      data: {
        email: `multi-admin-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `multi-func-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const condoA = await db.condominium.create({ data: { nome: `Alpha ${suffix}` } });
    const condoB = await db.condominium.create({ data: { nome: `Beta ${suffix}` } });
    const phone = `+55118${String(Date.now()).slice(-8)}`;

    const created = await cadastroService.createContact({
      nome: "Lucas Multi",
      phone,
      condominiumId: condoA.id,
    });
    expect(created.condominiumId).toBe(condoA.id);
    expect(await db.contactCondominium.count({ where: { contactId: created.id } })).toBe(1);

    let connection = await db.channelConnection.findFirst({ where: { type: "dev_mock" } });
    if (!connection) {
      connection = await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }
    const conv = await db.conversation.create({
      data: {
        connectionId: connection.id,
        contactId: created.id,
        condominiumId: condoA.id,
        peerPhoneE164: phone,
        unidentified: false,
      },
    });
    await db.triageItem.create({ data: { conversationId: conv.id, status: "aberto" } });

    const patched = await cadastroService.patchContact(admin, created.id, {
      condominiumId: condoB.id,
      condominiumIds: [condoA.id, condoB.id],
    });
    expect(patched.condominiumId).toBe(condoB.id);
    expect(patched.memberships.map((m) => m.condominiumId).sort()).toEqual([condoA.id, condoB.id].sort());

    const convAfter = await db.conversation.findFirstOrThrow({ where: { id: conv.id } });
    expect(convAfter.condominiumId).toBe(condoB.id);
    const triage = await db.triageItem.findUnique({ where: { conversationId: conv.id } });
    expect(triage?.status).toBe("aberto");

    const fichaA = await cadastroService.getCondominium(admin, condoA.id);
    const fichaB = await cadastroService.getCondominium(admin, condoB.id);
    expect(fichaA.contacts.some((c) => c.id === created.id)).toBe(true);
    expect(fichaB.contacts.some((c) => c.id === created.id)).toBe(true);

    await expect(
      tickets.createManual(admin, {
        title: "Manual no extra",
        category: "assembleia",
        priority: "media",
        condominiumId: condoA.id,
        contactId: created.id,
      }),
    ).resolves.toMatchObject({ condominiumId: condoA.id, contactId: created.id });

    await expect(
      cadastroService.patchContact(staff, created.id, { condominiumId: condoA.id }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<AppError>);

    const cleared = await cadastroService.patchContact(admin, created.id, {
      condominiumId: null,
      condominiumIds: [],
    });
    expect(cleared.condominiumId).toBeNull();
    expect(await db.contactCondominium.count({ where: { contactId: created.id } })).toBe(0);
    const convOut = await db.conversation.findFirstOrThrow({ where: { id: conv.id } });
    expect(convOut.condominiumId).toBeNull();
  });

  it("enroll grava principal e extras sem apagar vínculos e abre triagem", async () => {
    const suffix = `${Date.now()}`;
    const admin = await db.user.create({
      data: {
        email: `enroll-admin-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Enroll ${suffix}` } });
    const condoExtra = await db.condominium.create({ data: { nome: `Extra ${suffix}` } });
    const phone = `+55116${String(Date.now()).slice(-8)}`;

    let connection = await db.channelConnection.findFirst({ where: { type: "dev_mock" } });
    if (!connection) {
      connection = await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }

    const unlinked = await db.conversation.create({
      data: {
        connectionId: connection.id,
        peerPhoneE164: phone,
        unidentified: true,
      },
    });

    const enrolled = await cadastroService.enrollConversation(admin, unlinked.id, {
      nome: "Enroll Contato",
      condominiumId: condo.id,
      condominiumIds: [condo.id, condoExtra.id],
      phone,
    });
    expect(enrolled.triage.id).toBeTruthy();
    expect(enrolled.contact.condominiumId).toBe(condo.id);
    const memberships = await db.contactCondominium.findMany({ where: { contactId: enrolled.contact.id } });
    expect(memberships.map((m) => m.condominiumId).sort()).toEqual([condo.id, condoExtra.id].sort());
    const conv = await db.conversation.findFirstOrThrow({ where: { id: enrolled.conversation.id } });
    expect(conv.condominiumId).toBe(condo.id);
    expect(conv.contactId).toBe(enrolled.contact.id);
    expect(conv.unidentified).toBe(false);

    const condo2 = await db.condominium.create({ data: { nome: `Segundo ${suffix}` } });
    const again = await cadastroService.enrollConversation(admin, enrolled.conversation.id, {
      nome: "Enroll Contato",
      condominiumId: condo2.id,
      phone,
    });
    expect(again.contact.id).toBe(enrolled.contact.id);
    expect(again.contact.condominiumId).toBe(condo2.id);
    const after = await db.contactCondominium.findMany({ where: { contactId: enrolled.contact.id } });
    expect(after.map((m) => m.condominiumId).sort()).toEqual(
      [condo.id, condoExtra.id, condo2.id].sort(),
    );
  });
});
