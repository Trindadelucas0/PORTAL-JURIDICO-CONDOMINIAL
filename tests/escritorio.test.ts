import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { createAtendimentoService } from "@/lib/services/atendimento-service";
import { cadastroService } from "@/lib/services/cadastro-service";
import { createTicketService } from "@/lib/services/ticket-service";
import { noopDocumentIndex } from "@/lib/search/document-index-port";
import { hashPassword } from "@/lib/auth/session";
import { assertNotOfficeDatabase } from "./assert-not-office-db";

const db = new PrismaClient();
const atendimento = createAtendimentoService(db);
const tickets = createTicketService(db);

describe("escritorio operacional", () => {
  beforeAll(async () => {
    await db.$connect();
    await assertNotOfficeDatabase(db);
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

  it("public message sends immediately; blocked profile and internal notes do not", async () => {
    const suffix = `${Date.now()}-strict`;
    const admin = await db.user.create({
      data: {
        email: `admin-strict-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `staff-strict-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
        apenasRascunho: false,
        podeResponderCliente: true,
      },
    });
    const blocked = await db.user.create({
      data: {
        email: `staff-block-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
        apenasRascunho: true,
        podeResponderCliente: true,
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Strict ${suffix}` } });
    const contact = await db.contact.create({
      data: { nome: "Strict C", phoneE164: `+55116${String(Date.now()).slice(-8)}`, condominiumId: condo.id },
    });
    const ticket = await tickets.createManual(admin, {
      title: "Strict ticket",
      category: "outro",
      priority: "media",
      condominiumId: condo.id,
      contactId: contact.id,
      assignedToId: staff.id,
    });
    let mock = await db.channelConnection.findFirst({ where: { type: "dev_mock" } });
    if (!mock) {
      mock = await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }
    await db.conversation.update({
      where: { id: ticket.conversationId! },
      data: { connectionId: mock.id, unidentified: false, contactId: contact.id },
    });
    await db.ticket.update({ where: { id: ticket.id }, data: { assignedToId: blocked.id } });
    try {
      await atendimento.postMessage(blocked, ticket.conversationId!, {
        body: "nao pode",
        visibility: "publica",
      });
      throw new Error("expected forbidden");
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
    await db.ticket.update({ where: { id: ticket.id }, data: { assignedToId: staff.id } });
    const adminSend = await atendimento.postMessage(admin, ticket.conversationId!, {
      body: "admin direto",
      visibility: "publica",
    });
    expect(adminSend.sentToWhatsApp).toBe(true);
    expect(adminSend.message.sendStatus).toBe("sent");
    const staffSend = await atendimento.postMessage(staff, ticket.conversationId!, {
      body: "staff direto",
      visibility: "publica",
    });
    expect(staffSend.sentToWhatsApp).toBe(true);
    expect(staffSend.message.sendStatus).toBe("sent");
    const note = await atendimento.postMessage(staff, ticket.conversationId!, {
      body: "nota interna",
      visibility: "interna",
    });
    expect(note.sentToWhatsApp).toBe(false);
    expect(note.message.sendStatus).toBe("draft");
  });

  it("promote without assignee; employee cannot see unassigned", async () => {
    const suffix = `${Date.now()}-unassigned`;
    const admin = await db.user.create({
      data: {
        email: `admin-u-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `staff-u-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `U ${suffix}` } });
    const contact = await db.contact.create({
      data: { nome: "U C", phoneE164: `+55115${String(Date.now()).slice(-8)}`, condominiumId: condo.id },
    });
    const ticket = await tickets.createManual(admin, {
      title: "Sem dono",
      category: "outro",
      priority: "baixa",
      condominiumId: condo.id,
      contactId: contact.id,
      assignedToId: null,
    });
    expect(ticket.assignedToId).toBeNull();
    try {
      await tickets.get(staff, ticket.id);
      throw new Error("expected forbidden");
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
    const listed = await tickets.list(admin, 1, 20, { unassigned: true });
    expect(listed.items.some((row) => row.id === ticket.id)).toBe(true);
  });

  it("audit helper strips passwordHash", async () => {
    const { writeAudit } = await import("@/lib/services/audit-service");
    const suffix = `${Date.now()}-audit`;
    const admin = await db.user.create({
      data: {
        email: `admin-aud-${suffix}@juricon.local`,
        passwordHash: await hashPassword("secret-hash"),
        role: "admin",
      },
    });
    await writeAudit(db, {
      actorId: admin.id,
      action: "user.patch",
      entityType: "user",
      entityId: admin.id,
      after: { email: admin.email, passwordHash: "should-not-store", passwordOnce: "nope" },
    });
    const event = await db.auditEvent.findFirst({ where: { actorId: admin.id, action: "user.patch" }, orderBy: { createdAt: "desc" } });
    expect(event).toBeTruthy();
    const after = event!.afterJson as Record<string, unknown>;
    expect(after.passwordHash).toBeUndefined();
    expect(after.passwordOnce).toBeUndefined();
    expect(after.email).toBe(admin.email);
  });

  it("funcionario cannot list audit", async () => {
    const { createAuditService } = await import("@/lib/services/audit-service");
    const suffix = `${Date.now()}-aud403`;
    const staff = await db.user.create({
      data: {
        email: `staff-aud-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    try {
      await createAuditService(db).list(staff, 1, 20);
      throw new Error("expected forbidden");
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
  });

  it("enrolls unknown number into flow; staff cannot list unlinked", async () => {
    const suffix = `${Date.now()}-enroll`;
    const admin = await db.user.create({
      data: {
        email: `admin-enr-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `staff-enr-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Enroll ${suffix}` } });
    let connection = await db.channelConnection.findFirst({ where: { type: "dev_mock" } });
    if (!connection) {
      connection = await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }
    const phone = `+55113${String(Date.now()).slice(-8)}`;
    const inbound = await atendimento.ingestInbound({
      waMessageId: `enroll-${suffix}`,
      fromPhone: phone,
      body: "oi avulso",
      connectionType: "dev_mock",
    });
    expect(inbound.triageId).toBeNull();
    try {
      await atendimento.listConversations(staff, 1, 20, undefined, { unlinked: true });
      throw new Error("expected forbidden");
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
    const enrolled = await cadastroService.enrollConversation(admin, inbound.conversationId, {
      nome: "Sindico Novo",
      condominiumId: condo.id,
      phone,
    });
    expect(enrolled.triage.id).toBeTruthy();
    const again = await atendimento.ingestInbound({
      waMessageId: `enroll-2-${suffix}`,
      fromPhone: phone,
      body: "segunda",
      connectionType: "dev_mock",
    });
    expect(again.unidentified).toBe(false);
    expect(again.triageId).toBe(enrolled.triage.id);
    try {
      await cadastroService.patchTriage(admin, enrolled.triage.id, { action: "identify", contactId: enrolled.contact.id });
      throw new Error("expected unprocessable");
    } catch (e) {
      expect((e as AppError).status).toBe(422);
    }
  });
});

describe("document index port", () => {
  it("is a no-op without embeddings", async () => {
    const res = await noopDocumentIndex.enqueue({ documentId: "x", storageKey: "k" });
    expect(res.queued).toBe(false);
    expect(res.reason).toBe("noop");
  });
});
