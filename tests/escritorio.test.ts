import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { createAtendimentoService } from "@/lib/services/atendimento-service";
import { createTicketService } from "@/lib/services/ticket-service";
import { noopDocumentIndex } from "@/lib/search/document-index-port";
import { hashPassword } from "@/lib/auth/session";

const db = new PrismaClient();
const atendimento = createAtendimentoService(db);
const tickets = createTicketService(db);

describe("escritorio operacional", () => {
  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("promote creates ticket; inbound never creates ticket", async () => {
    const suffix = `${Date.now()}`;
    const admin = await db.user.upsert({
      where: { email: `admin-test-${suffix}@juricon.local` },
      update: {},
      create: {
        email: `admin-test-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `func-test-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
        apenasRascunho: true,
        podeResponderCliente: true,
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Condo ${suffix}` } });
    const phone = `+55119${String(Date.now()).slice(-8)}`;
    const contact = await db.contact.create({
      data: { nome: "Sindico Teste", phoneE164: phone, condominiumId: condo.id },
    });
    let connection = await db.channelConnection.findFirst({ where: { type: "dev_mock" } });
    if (!connection) {
      connection = await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }
    expect(connection).toBeTruthy();

    const before = await db.ticket.count();
    const ingest = await atendimento.ingestInbound({
      waMessageId: `promote-${suffix}`,
      fromPhone: phone,
      body: "Preciso de ata",
      connectionType: "dev_mock",
    });
    expect(ingest.ticketCreated).toBe(false);
    expect(await db.ticket.count()).toBe(before);

    const triage = await db.triageItem.findFirstOrThrow({ where: { id: ingest.triageId! } });
    await db.conversation.update({
      where: { id: ingest.conversationId },
      data: { contactId: contact.id, condominiumId: condo.id, unidentified: false },
    });

    const ticket = await tickets.promoteFromTriage(admin, triage.id, {
      category: "assembleia",
      priority: "alta",
      assignedToId: staff.id,
    });
    expect(ticket.protocol).toMatch(/^\d{4}-\d{4}$/);
    expect(ticket.assignedToId).toBe(staff.id);

    const afterInbound = await atendimento.ingestInbound({
      waMessageId: `promote-2-${suffix}`,
      fromPhone: phone,
      body: "segunda",
      connectionType: "dev_mock",
    });
    expect(afterInbound.ticketCreated).toBe(false);
  });

  it("IDOR: funcionario gets 403 on foreign ticket, 404 when missing", async () => {
    const suffix = `${Date.now()}-idor`;
    const admin = await db.user.create({
      data: {
        email: `admin-idor-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const a = await db.user.create({
      data: {
        email: `a-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const b = await db.user.create({
      data: {
        email: `b-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Idor ${suffix}` } });
    const contact = await db.contact.create({
      data: { nome: "Contato I", phoneE164: `+55118${String(Date.now()).slice(-8)}`, condominiumId: condo.id },
    });
    const mine = await tickets.createManual(admin, {
      title: "Chamado A",
      category: "outro",
      priority: "baixa",
      condominiumId: condo.id,
      contactId: contact.id,
      assignedToId: a.id,
    });
    try {
      await tickets.get(b, mine.id);
      throw new Error("expected forbidden");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(403);
    }
    try {
      await tickets.get(a, "00000000-0000-4000-8000-000000000000");
      throw new Error("expected not found");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(404);
    }
    const ok = await tickets.get(a, mine.id);
    expect(ok.id).toBe(mine.id);
  });

  it("draft does not send via provider", async () => {
    const suffix = `${Date.now()}-draft`;
    const staff = await db.user.create({
      data: {
        email: `draft-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
        apenasRascunho: true,
        podeResponderCliente: true,
      },
    });
    const admin =
      (await db.user.findFirst({ where: { role: "admin", deletedAt: null } })) ||
      (await db.user.create({
        data: {
          email: `admin-draft-${suffix}@juricon.local`,
          passwordHash: await hashPassword("x"),
          role: "admin",
        },
      }));
    const condo = await db.condominium.create({ data: { nome: `Draft ${suffix}` } });
    const contact = await db.contact.create({
      data: { nome: "Draft C", phoneE164: `+55117${String(Date.now()).slice(-8)}`, condominiumId: condo.id },
    });
    const ticket = await tickets.createManual(admin!, {
      title: "Draft ticket",
      category: "outro",
      priority: "media",
      condominiumId: condo.id,
      contactId: contact.id,
      assignedToId: staff.id,
    });
    const result = await atendimento.postMessage(staff, ticket.conversationId!, {
      body: "rascunho cliente",
      visibility: "publica",
    });
    expect(result.sentToWhatsApp).toBe(false);
    expect(result.message.sendStatus).toBe("draft");
    expect(result.message.waMessageId).toBeNull();
  });
});

describe("document index port", () => {
  it("is a no-op without embeddings", async () => {
    const res = await noopDocumentIndex.enqueue({ documentId: "x", storageKey: "k" });
    expect(res.queued).toBe(false);
    expect(res.reason).toBe("noop");
  });
});
