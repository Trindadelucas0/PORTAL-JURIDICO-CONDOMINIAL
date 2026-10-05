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
    expect(ticket.title).toBe("Sindico Teste — Assembleia");

    const afterInbound = await atendimento.ingestInbound({
      waMessageId: `promote-2-${suffix}`,
      fromPhone: phone,
      body: "segunda",
      connectionType: "dev_mock",
    });
    expect(afterInbound.ticketCreated).toBe(false);
  });

  it("inbound after resolved ticket opens a new ticket", async () => {
    const suffix = `${Date.now()}-resolved`;
    const admin = await db.user.upsert({
      where: { email: `admin-resolved-${suffix}@juricon.local` },
      update: {},
      create: {
        email: `admin-resolved-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Condo resolved ${suffix}` } });
    const phone = `+55118${String(Date.now()).slice(-8)}`;
    const contact = await db.contact.create({
      data: { nome: "Maria Resolvida", phoneE164: phone, condominiumId: condo.id },
    });
    let connection = await db.channelConnection.findFirst({ where: { type: "dev_mock" } });
    if (!connection) {
      connection = await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }
    expect(connection).toBeTruthy();

    const ingest = await atendimento.ingestInbound({
      waMessageId: `resolved-1-${suffix}`,
      fromPhone: phone,
      body: "Primeiro assunto",
      connectionType: "dev_mock",
    });
    expect(ingest.ticketCreated).toBe(false);
    expect(ingest.triageId).toBeTruthy();

    const ticket = await tickets.promoteFromTriage(admin, ingest.triageId!, {
      category: "assembleia",
      priority: "alta",
    });
    await tickets.patch(admin, ticket.id, { status: "em_andamento" });

    const whileOpen = await atendimento.ingestInbound({
      waMessageId: `resolved-2-${suffix}`,
      fromPhone: phone,
      body: "Ainda no mesmo chamado",
      connectionType: "dev_mock",
    });
    expect(whileOpen.ticketCreated).toBe(false);
    const whileOpenMsg = await db.message.findFirstOrThrow({ where: { id: whileOpen.messageId } });
    expect(whileOpenMsg.ticketId).toBe(ticket.id);

    await tickets.patch(admin, ticket.id, { status: "resolvido" });
    const countBefore = await db.ticket.count();

    const again = await atendimento.ingestInbound({
      waMessageId: `resolved-3-${suffix}`,
      fromPhone: phone,
      body: "Assunto novo",
      connectionType: "dev_mock",
    });
    expect(again.ticketCreated).toBe(true);
    expect(await db.ticket.count()).toBe(countBefore + 1);

    const newMsg = await db.message.findFirstOrThrow({ where: { id: again.messageId } });
    expect(newMsg.ticketId).toBeTruthy();
    expect(newMsg.ticketId).not.toBe(ticket.id);

    const created = await db.ticket.findFirstOrThrow({ where: { id: newMsg.ticketId! } });
    expect(created.protocol).not.toBe(ticket.protocol);
    expect(created.status).toBe("aberto");
    expect(created.category).toBe("outro");
    expect(created.priority).toBe("media");
    expect(created.assignedToId).toBeNull();
    expect(created.title).toBe("Maria Resolvida — Outro");
    expect(created.origin).toBe("whatsapp");
    expect(created.conversationId).toBe(ingest.conversationId);

    const old = await db.ticket.findFirstOrThrow({ where: { id: ticket.id } });
    expect(old.status).toBe("resolvido");
    expect(whileOpenMsg.ticketId).toBe(old.id);

    const triage = await db.triageItem.findFirstOrThrow({ where: { conversationId: ingest.conversationId } });
    expect(triage.status).toBe("promovido");
    expect(triage.ticketId).toBe(created.id);
  });


  it("createManual rejects contact from another condominium", async () => {
    const suffix = `${Date.now()}-condo-mismatch`;
    const admin = await db.user.create({
      data: {
        email: `admin-mismatch-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const condoA = await db.condominium.create({ data: { nome: `Condo A ${suffix}` } });
    const condoB = await db.condominium.create({ data: { nome: `Condo B ${suffix}` } });
    const contactB = await db.contact.create({
      data: {
        nome: "Contato B",
        phoneE164: `+55117${String(Date.now()).slice(-8)}`,
        condominiumId: condoB.id,
      },
    });
    try {
      await tickets.createManual(admin, {
        title: "Chamado errado",
        category: "outro",
        priority: "media",
        condominiumId: condoA.id,
        contactId: contactB.id,
        assignedToId: null,
      });
      throw new Error("expected unprocessable");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(422);
    }
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
    const draft = await atendimento.postMessage(blocked, ticket.conversationId!, {
      body: "rascunho para aprovacao",
      visibility: "publica",
    });
    expect(draft.sentToWhatsApp).toBe(false);
    expect(draft.awaitingApproval).toBe(true);
    expect(draft.message.sendStatus).toBe("draft");
    expect(draft.message.visibility).toBe("publica");
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

  it("team lists open ticket load", async () => {
    const { createTeamService } = await import("@/lib/services/team-service");
    const team = createTeamService(db);
    const suffix = `${Date.now()}-load`;
    const admin = await db.user.create({
      data: {
        email: `admin-dl-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `staff-dl-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `DL ${suffix}` } });
    const contact = await db.contact.create({
      data: { nome: "DL C", phoneE164: `+55114${String(Date.now()).slice(-8)}`, condominiumId: condo.id },
    });
    const ticket = await tickets.createManual(admin, {
      title: "Com responsável",
      category: "outro",
      priority: "alta",
      condominiumId: condo.id,
      contactId: contact.id,
      assignedToId: staff.id,
    });
    const listed = await tickets.list(admin, 1, 20, { condominiumId: condo.id });
    const row = listed.items.find((item) => item.id === ticket.id);
    expect(row?.id).toBe(ticket.id);
    const members = await team.list();
    const staffRow = members.find((m) => m.id === staff.id);
    expect(staffRow?.openTickets).toBeGreaterThanOrEqual(1);
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
  it("stays a no-op when AI_RAG_ENABLED is off", async () => {
    const prev = process.env.AI_RAG_ENABLED;
    delete process.env.AI_RAG_ENABLED;
    const res = await noopDocumentIndex.enqueue({ documentId: "x", storageKey: "k" });
    expect(res.queued).toBe(false);
    expect(res.reason).toBe("noop");
    if (prev) process.env.AI_RAG_ENABLED = prev;
  });
});

describe("documentos ficha", () => {
  beforeAll(async () => {
    await db.$connect();
    await assertNotOfficeDatabase(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("summary lists condominiums with count 0; ficha required; staff needs condo of assigned ticket", async () => {
    const { ZodError } = await import("zod");
    const { createDocumentService } = await import("@/lib/services/document-service");
    const docs = createDocumentService(db);
    const suffix = `${Date.now()}`;
    const admin = await db.user.upsert({
      where: { email: `admin-doc-${suffix}@juricon.local` },
      update: {},
      create: {
        email: `admin-doc-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `func-doc-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
        podeResponderCliente: true,
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Condo Doc ${suffix}` } });

    const summaryEmpty = await docs.summaryByCondominium(admin);
    const folder = summaryEmpty.find((s) => s.condominiumId === condo.id);
    expect(folder).toBeTruthy();
    expect(folder!.count).toBe(0);

    try {
      await docs.upload(admin, {
        kind: "ata_assembleia",
        title: "Ata",
        purpose: "curto",
        condominiumId: condo.id,
        file: { buffer: Buffer.from("%PDF-1.4"), name: "ata.pdf", mime: "application/pdf" },
      });
      throw new Error("expected validation");
    } catch (e) {
      expect(e instanceof ZodError).toBe(true);
    }

    try {
      await docs.upload(admin, {
        kind: "ata_assembleia",
        title: "Ata assembleia",
        purpose: "Para aprovar contas do condominio",
        file: { buffer: Buffer.from("%PDF-1.4"), name: "ata.pdf", mime: "application/pdf" },
      });
      throw new Error("expected unprocessable");
    } catch (e) {
      expect((e as AppError).status).toBe(422);
    }

    try {
      await docs.upload(staff, {
        kind: "ata_assembleia",
        title: "Ata assembleia",
        purpose: "Para aprovar contas do condominio",
        condominiumId: condo.id,
        file: { buffer: Buffer.from("%PDF-1.4"), name: "ata.pdf", mime: "application/pdf" },
      });
      throw new Error("expected forbidden");
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }

    const created = await docs.upload(admin, {
      kind: "ata_assembleia",
      title: "Assembleia 12/03",
      purpose: "Aprovar contas e eleicao do sindico",
      condominiumId: condo.id,
      ticketId: "ignored-not-uuid",
      file: { buffer: Buffer.from("%PDF-1.4-ok"), name: "ata.pdf", mime: "application/pdf" },
    });
    expect(created.kind).toBe("ata_assembleia");
    expect(created.title).toBe("Assembleia 12/03");
    expect(created.purpose).toContain("Aprovar");
    expect(created.ticketId).toBeNull();

    const contact = await db.contact.create({
      data: { nome: "Doc C", phoneE164: `+55115${String(Date.now()).slice(-8)}`, condominiumId: condo.id },
    });
    const ticket = await tickets.createManual(admin, {
      title: "Chamado docs",
      category: "outro",
      priority: "media",
      condominiumId: condo.id,
      contactId: contact.id,
      assignedToId: staff.id,
    });
    const staffDoc = await docs.upload(staff, {
      kind: "regimento",
      title: "Regimento",
      purpose: "Uso interno da administracao",
      condominiumId: condo.id,
      file: { buffer: Buffer.from("%PDF-1.4-staff"), name: "reg.pdf", mime: "application/pdf" },
    });
    expect(staffDoc.ticketId).toBeNull();

    const linked = await docs.upload(admin, {
      kind: "regimento",
      title: "Regimento com chamado",
      purpose: "Uso interno da administracao",
      condominiumId: condo.id,
      ticketId: ticket.id,
      file: { buffer: Buffer.from("%PDF-1.4-linked"), name: "linked.pdf", mime: "application/pdf" },
    });
    expect(linked.ticketId).toBe(ticket.id);

    const patched = await docs.patchTicketId(admin, created.id, ticket.id);
    expect(patched.ticketId).toBe(ticket.id);

    const listed = await docs.list(staff, 1, 50, condo.id);
    expect(listed.items.some((d) => d.id === created.id)).toBe(true);
    expect(listed.items.some((d) => d.id === staffDoc.id)).toBe(true);

    const summaryAfter = await docs.summaryByCondominium(admin);
    const folderAfter = summaryAfter.find((s) => s.condominiumId === condo.id);
    expect(folderAfter!.count).toBeGreaterThanOrEqual(2);

    const audit = await db.auditEvent.findFirst({
      where: { entityId: created.id, action: "document.create" },
    });
    expect(audit).toBeTruthy();
  });
});

describe("documentos do sistema", () => {
  beforeAll(async () => {
    await db.$connect();
    await assertNotOfficeDatabase(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("admin creates category and file; staff reads; staff POST 403; delete filled category 422", async () => {
    const { ZodError } = await import("zod");
    const { createSystemDocumentService } = await import("@/lib/services/system-document-service");
    const sys = createSystemDocumentService(db);
    const suffix = `${Date.now()}`;
    const admin = await db.user.create({
      data: {
        email: `admin-sysdoc-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `func-sysdoc-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const cat = await sys.createCategory(admin, { nome: `Regras ${suffix}` });
    expect(cat.nome).toContain("Regras");

    try {
      await sys.createCategory(staff, { nome: `Aviso ${suffix}` });
      throw new Error("expected forbidden");
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }

    try {
      await sys.upload(admin, {
        categoryId: cat.id,
        title: "Edital",
        purpose: "curto",
        whenToUse: "Quando houver assembleia extra",
        searchHints: "quorum convocacao prazo edital",
        file: { buffer: Buffer.from("%PDF-1.4"), name: "e.pdf", mime: "application/pdf" },
      });
      throw new Error("expected validation");
    } catch (e) {
      expect(e instanceof ZodError).toBe(true);
    }

    const created = await sys.upload(admin, {
      categoryId: cat.id,
      title: "Como convocar",
      purpose: "Orientar convocacao de assembleia extra",
      whenToUse: "Quando o sindico pedir assembleia extraordinaria",
      searchHints: "quorum convocacao prazo de edital",
      file: { buffer: Buffer.from("%PDF-1.4-sys"), name: "conv.pdf", mime: "application/pdf" },
    });
    expect(created.title).toBe("Como convocar");

    try {
      await sys.upload(staff, {
        categoryId: cat.id,
        title: "Staff file",
        purpose: "Tentativa de gravar pelo funcionario",
        whenToUse: "Nao deveria gravar este arquivo",
        searchHints: "funcionario sem permissao de escrita",
        file: { buffer: Buffer.from("%PDF-1.4-no"), name: "no.pdf", mime: "application/pdf" },
      });
      throw new Error("expected forbidden");
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }

    const listed = await sys.list(staff, 1, 50, cat.id);
    expect(listed.items.some((d) => d.id === created.id)).toBe(true);
    const read = await sys.authorizeRead(staff, created.storageKey);
    expect(read.id).toBe(created.id);

    try {
      await sys.deleteCategory(admin, cat.id);
      throw new Error("expected unprocessable");
    } catch (e) {
      expect((e as AppError).status).toBe(422);
    }

    const cats = await sys.listCategories();
    const folder = cats.find((c) => c.id === cat.id);
    expect(folder?.count).toBeGreaterThanOrEqual(1);
  });
});
