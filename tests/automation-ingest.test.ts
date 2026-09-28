import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAtendimentoService } from "@/lib/services/atendimento-service";
import { processInbound } from "@/lib/services/automation-service";
import { hashPassword } from "@/lib/auth/session";
import { businessDateKey, businessDayStart, businessMinutes, shiftBusinessDate } from "@/lib/time/business-clock";
import { assertNotOfficeDatabase } from "./assert-not-office-db";

const db = new PrismaClient();
const atendimento = createAtendimentoService(db);

type RuleSnap = {
  id: string;
  ativo: boolean;
  startsAt: string;
  endsAt: string;
  skipActiveTicket: boolean;
  body: string;
};

async function loadRule() {
  const rule = await db.automationRule.findFirst({ where: { trigger: "first_message_of_day" } });
  if (!rule) throw new Error("AutomationRule ausente. Rode a migration antes do teste.");
  return rule;
}

describe("primeira mensagem do dia", () => {
  let snap: RuleSnap;
  const suffix = `${Date.now()}`;
  const createdContactIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdCondoIds: string[] = [];
  const createdConnectionIds: string[] = [];

  beforeAll(async () => {
    await db.$connect();
    await assertNotOfficeDatabase(db);
    const rule = await loadRule();
    snap = {
      id: rule.id,
      ativo: rule.ativo,
      startsAt: rule.startsAt,
      endsAt: rule.endsAt,
      skipActiveTicket: rule.skipActiveTicket,
      body: rule.body,
    };
  });

  afterEach(async () => {
    if (!snap) return;
    await db.automationRule.update({
      where: { id: snap.id },
      data: {
        ativo: snap.ativo,
        startsAt: snap.startsAt,
        endsAt: snap.endsAt,
        skipActiveTicket: snap.skipActiveTicket,
        body: snap.body,
      },
    });
  });

  afterAll(async () => {
    if (snap) {
      await db.automationRule.update({
        where: { id: snap.id },
        data: {
          ativo: snap.ativo,
          startsAt: snap.startsAt,
          endsAt: snap.endsAt,
          skipActiveTicket: snap.skipActiveTicket,
          body: snap.body,
        },
      });
    }
    if (createdContactIds.length) {
      await db.automationExecution.deleteMany({ where: { contactId: { in: createdContactIds } } });
      await db.message.deleteMany({ where: { conversation: { contactId: { in: createdContactIds } } } });
      await db.ticket.deleteMany({ where: { contactId: { in: createdContactIds } } });
      await db.conversation.deleteMany({ where: { contactId: { in: createdContactIds } } });
      await db.contact.deleteMany({ where: { id: { in: createdContactIds } } });
    }
    if (createdCondoIds.length) await db.condominium.deleteMany({ where: { id: { in: createdCondoIds } } });
    if (createdConnectionIds.length) await db.channelConnection.deleteMany({ where: { id: { in: createdConnectionIds } } });
    if (createdUserIds.length) await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await db.$disconnect();
  });

  async function openRule(data: Partial<RuleSnap>) {
    await db.automationRule.update({ where: { id: snap.id }, data });
  }

  async function contactOnMock(nome: string) {
    const condo = await db.condominium.create({ data: { nome: `Condo ${nome} ${suffix}` } });
    createdCondoIds.push(condo.id);
    const phone = `+55119${String(Date.now()).slice(-7)}${createdContactIds.length}`;
    const contact = await db.contact.create({
      data: { nome, phoneE164: phone, condominiumId: condo.id },
    });
    createdContactIds.push(contact.id);
    let connection = await db.channelConnection.findFirst({ where: { type: "dev_mock", status: "open" } });
    if (!connection) {
      connection = await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }
    return { contact, connection, phone: contact.phoneE164 };
  }

  it("sends once for the first inbound and ignores the second the same day", async () => {
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: true });
    const { contact, connection, phone } = await contactOnMock(`Auto ${suffix}`);
    const first = await atendimento.ingestInbound({
      waMessageId: `auto-1-${suffix}`,
      fromPhone: phone,
      body: "Bom dia",
      connectionId: connection.id,
    });
    expect(first.created).toBe(true);
    const sent = await db.message.count({
      where: { conversationId: first.conversationId, automated: true, sendStatus: "sent" },
    });
    expect(sent).toBe(1);
    const execution = await db.automationExecution.findFirst({
      where: { contactId: contact.id, businessDate: businessDateKey(new Date()) },
    });
    expect(execution?.status).toBe("sent");
    const audit = await db.auditEvent.findFirst({
      where: { entityType: "automationExecution", entityId: execution?.id, action: "automation.sent" },
    });
    expect(audit?.actorId).toBeNull();

    const second = await atendimento.ingestInbound({
      waMessageId: `auto-2-${suffix}`,
      fromPhone: phone,
      body: "Ainda estou aqui",
      connectionId: connection.id,
    });
    expect(second.created).toBe(true);
    const sentAfter = await db.message.count({
      where: { conversationId: first.conversationId, automated: true },
    });
    expect(sentAfter).toBe(1);

    const replay = await atendimento.ingestInbound({
      waMessageId: `auto-1-${suffix}`,
      fromPhone: phone,
      body: "Bom dia",
      connectionId: connection.id,
    });
    expect(replay.created).toBe(false);
    expect(
      await db.message.count({ where: { conversationId: first.conversationId, automated: true } }),
    ).toBe(1);
  });

  it("sends again on the next business date", async () => {
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: false });
    const { contact, connection, phone } = await contactOnMock(`Auto dia ${suffix}`);
    const first = await atendimento.ingestInbound({
      waMessageId: `auto-day-${suffix}`,
      fromPhone: phone,
      body: "Oi",
      connectionId: connection.id,
    });
    const yesterday = shiftBusinessDate(businessDateKey(new Date()), -1);
    await db.message.updateMany({
      where: { conversationId: first.conversationId },
      data: { createdAt: businessDayStart(yesterday) },
    });
    await db.automationExecution.updateMany({
      where: { contactId: contact.id },
      data: { businessDate: yesterday },
    });
    await atendimento.ingestInbound({
      waMessageId: `auto-day2-${suffix}`,
      fromPhone: phone,
      body: "Oi de novo",
      connectionId: connection.id,
    });
    expect(
      await db.automationExecution.count({ where: { contactId: contact.id, status: "sent" } }),
    ).toBe(2);
  });

  it("consumes the day when the first inbound is outside the window", async () => {
    const minute = businessMinutes(new Date());
    const closed = minute < 2 ? { startsAt: "00:02", endsAt: "00:04" } : { startsAt: "00:00", endsAt: "00:01" };
    await openRule({ ativo: true, ...closed, skipActiveTicket: false });
    const { contact, connection, phone } = await contactOnMock(`Auto hora ${suffix}`);
    await atendimento.ingestInbound({
      waMessageId: `auto-early-${suffix}`,
      fromPhone: phone,
      body: "Cedo",
      connectionId: connection.id,
    });
    const skipped = await db.automationExecution.findFirst({ where: { contactId: contact.id } });
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.reason).toBe("outside_hours");
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: false });
    await atendimento.ingestInbound({
      waMessageId: `auto-later-${suffix}`,
      fromPhone: phone,
      body: "Agora",
      connectionId: connection.id,
    });
    expect(await db.message.count({ where: { conversation: { contactId: contact.id }, automated: true } })).toBe(0);
  });

  it("does not send to a number without Contact", async () => {
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: false });
    const connection = await db.channelConnection.findFirst({ where: { type: "dev_mock", status: "open" } });
    if (!connection) throw new Error("Conexão dev_mock ausente");
    const phone = `+55119888${String(Date.now()).slice(-4)}`;
    const result = await atendimento.ingestInbound({
      waMessageId: `auto-anon-${suffix}`,
      fromPhone: phone,
      body: "Sem cadastro",
      connectionId: connection.id,
    });
    expect(result.unidentified).toBe(true);
    expect(await db.automationExecution.count({ where: { conversationId: result.conversationId } })).toBe(0);
    await db.message.deleteMany({ where: { conversationId: result.conversationId } });
    await db.conversation.delete({ where: { id: result.conversationId } });
  });

  it("does not run for an outbound echo", async () => {
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: false });
    const { contact, connection, phone } = await contactOnMock(`Auto eco ${suffix}`);
    const inbound = await atendimento.ingestInbound({
      waMessageId: `auto-eco-in-${suffix}`,
      fromPhone: phone,
      body: "Cliente",
      connectionId: connection.id,
    });
    await atendimento.ingestOwnOutbound({
      waMessageId: `auto-eco-out-${suffix}`,
      fromPhone: phone,
      body: "Equipe",
      connectionType: "dev_mock",
    });
    expect(await db.automationExecution.count({ where: { contactId: contact.id } })).toBe(1);
    expect(inbound.created).toBe(true);
  });

  it("skips when the contact has an open ticket", async () => {
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: true });
    const admin = await db.user.create({
      data: {
        email: `auto-admin-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    createdUserIds.push(admin.id);
    const { contact, connection, phone } = await contactOnMock(`Auto ticket ${suffix}`);
    const condo = await db.condominium.findFirst({ where: { contacts: { some: { id: contact.id } } } });
    await db.ticket.create({
      data: {
        protocol: `A${suffix}`,
        title: "Aberto",
        status: "aberto",
        priority: "media",
        category: "outro",
        origin: "manual",
        condominiumId: condo!.id,
        contactId: contact.id,
        createdById: admin.id,
      },
    });
    await atendimento.ingestInbound({
      waMessageId: `auto-ticket-${suffix}`,
      fromPhone: phone,
      body: "Tenho chamado",
      connectionId: connection.id,
    });
    const execution = await db.automationExecution.findFirst({ where: { contactId: contact.id } });
    expect(execution?.status).toBe("skipped");
    expect(execution?.reason).toBe("active_ticket");
  });

  it("keeps the inbound when the provider fails and does not retry", async () => {
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: false });
    const condo = await db.condominium.create({ data: { nome: `Condo falha ${suffix}` } });
    createdCondoIds.push(condo.id);
    const phone = `+55119777${String(Date.now()).slice(-4)}`;
    const contact = await db.contact.create({
      data: { nome: `Auto falha ${suffix}`, phoneE164: phone, condominiumId: condo.id },
    });
    createdContactIds.push(contact.id);
    const connection = await db.channelConnection.create({
      data: { type: "evolution_cloud", status: "open", label: `Cloud ${suffix}` },
    });
    createdConnectionIds.push(connection.id);
    const result = await atendimento.ingestInbound({
      waMessageId: `auto-fail-${suffix}`,
      fromPhone: phone,
      body: "Preciso de ajuda",
      connectionId: connection.id,
    });
    const inbound = await db.message.findFirst({ where: { id: result.messageId, direction: "in" } });
    expect(inbound?.body).toBe("Preciso de ajuda");
    const execution = await db.automationExecution.findFirst({ where: { contactId: contact.id } });
    expect(execution?.status).toBe("failed");
    expect(execution?.errorCode).toBe("send_failed");
    await atendimento.ingestInbound({
      waMessageId: `auto-fail-2-${suffix}`,
      fromPhone: phone,
      body: "De novo",
      connectionId: connection.id,
    });
    expect(await db.automationExecution.count({ where: { contactId: contact.id } })).toBe(1);
  });

  it("reserves only one execution when two messages arrive together", async () => {
    await openRule({ ativo: true, startsAt: "00:00", endsAt: "23:59", skipActiveTicket: false });
    const { contact, connection, phone } = await contactOnMock(`Auto race ${suffix}`);
    const opened = await atendimento.ingestInbound({
      waMessageId: `auto-race-seed-${suffix}`,
      fromPhone: phone,
      body: "semente",
      connectionId: connection.id,
    });
    await db.automationExecution.deleteMany({ where: { contactId: contact.id } });
    await db.message.deleteMany({ where: { conversationId: opened.conversationId } });
    const at = new Date();
    const a = await db.message.create({
      data: {
        conversationId: opened.conversationId,
        direction: "in",
        visibility: "publica",
        sendStatus: "sent",
        waMessageId: `auto-race-a-${suffix}`,
        body: "A",
        createdAt: at,
      },
    });
    const b = await db.message.create({
      data: {
        conversationId: opened.conversationId,
        direction: "in",
        visibility: "publica",
        sendStatus: "sent",
        waMessageId: `auto-race-b-${suffix}`,
        body: "B",
        createdAt: at,
      },
    });
    await Promise.all([
      processInbound(db, {
        messageId: a.id,
        conversationId: opened.conversationId,
        contactId: contact.id,
        createdAt: at,
      }),
      processInbound(db, {
        messageId: b.id,
        conversationId: opened.conversationId,
        contactId: contact.id,
        createdAt: at,
      }),
    ]);
    expect(await db.automationExecution.count({ where: { contactId: contact.id } })).toBe(1);
    expect(
      await db.message.count({ where: { conversationId: opened.conversationId, automated: true, sendStatus: "sent" } }),
    ).toBe(1);
  });
});
