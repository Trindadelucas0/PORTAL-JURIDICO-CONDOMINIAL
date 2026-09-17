import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAtendimentoService } from "@/lib/services/atendimento-service";
import { cadastroService } from "@/lib/services/cadastro-service";
import { hashPassword } from "@/lib/auth/session";
import { phoneFromWhatsAppLid } from "@/lib/channels/evolution-webhook";
import { assertNotOfficeDatabase } from "./assert-not-office-db";

const db = new PrismaClient();
const svc = createAtendimentoService(db);

describe("inbound ingest", () => {
  beforeAll(async () => {
    await db.$connect();
    await assertNotOfficeDatabase(db);
    const mock = await db.channelConnection.findFirst({ where: { type: "dev_mock" } });
    if (!mock) {
      await db.channelConnection.create({
        data: { type: "dev_mock", status: "open", label: "Dev / mock" },
      });
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates conversation + triage and is idempotent; never creates ticket", async () => {
    const waMessageId = `test-${Date.now()}`;
    const fromPhone = `+55119${String(Date.now()).slice(-8)}`;
    const beforeTickets = await db.ticket.count();
    const first = await svc.ingestInbound({
      waMessageId,
      fromPhone,
      body: "Olá, preciso de orientação",
      connectionType: "dev_mock",
    });
    expect(first.created).toBe(true);
    expect(first.triageId).toBeTruthy();
    expect(first.unidentified).toBe(true);
    const conv = await db.conversation.findFirstOrThrow({ where: { id: first.conversationId } });
    expect(conv.peerPhoneE164).toBe(fromPhone);

    const second = await svc.ingestInbound({
      waMessageId,
      fromPhone,
      body: "Olá, preciso de orientação",
      connectionType: "dev_mock",
    });
    expect(second.created).toBe(false);
    expect(second.messageId).toBe(first.messageId);

    const messages = await db.message.count({ where: { waMessageId } });
    expect(messages).toBe(1);
    expect(first.ticketCreated).toBe(false);
    expect(await db.ticket.count()).toBe(beforeTickets);
  });

  it("keeps the same conversation for two LID messages and after identify", async () => {
    const suffix = `${Date.now()}`;
    const lidJid = `${suffix.slice(-10)}43035656@lid`;
    const lidPhone = phoneFromWhatsAppLid(lidJid);
    expect(lidPhone).toBeTruthy();
    const first = await svc.ingestInbound({
      waMessageId: `lid-a-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "oi",
      connectionType: "dev_mock",
    });
    const second = await svc.ingestInbound({
      waMessageId: `lid-b-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "oi de novo",
      connectionType: "dev_mock",
    });
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.created).toBe(true);
    expect(await db.triageItem.count({ where: { conversationId: first.conversationId } })).toBe(1);

    const admin = await db.user.create({
      data: {
        email: `lid-admin-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Lid ${suffix}` } });
    const contact = await db.contact.create({
      data: {
        nome: "Lid Contato",
        phoneE164: `+55117${String(Date.now()).slice(-8)}`,
        condominiumId: condo.id,
      },
    });
    await cadastroService.patchTriage(admin, first.triageId!, { action: "identify", contactId: contact.id });
    const third = await svc.ingestInbound({
      waMessageId: `lid-c-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "depois de identificar",
      connectionType: "dev_mock",
    });
    expect(third.conversationId).toBe(first.conversationId);
    expect(third.unidentified).toBe(false);
  });

  it("matches contact with Brazil 8/9 digit variant", async () => {
    const suffix = `${Date.now()}`;
    const withNine = `+5511988${suffix.slice(-6)}`;
    const digits = withNine.replace(/\D/g, "");
    const withoutNine = `+${digits.slice(0, 4)}${digits.slice(5)}`;
    const condo = await db.condominium.create({ data: { nome: `Var ${suffix}` } });
    await db.contact.create({
      data: { nome: "Var Contato", phoneE164: withNine, condominiumId: condo.id },
    });
    const inbound = await svc.ingestInbound({
      waMessageId: `var-${suffix}`,
      fromPhone: withoutNine,
      body: "variante",
      connectionType: "dev_mock",
    });
    expect(inbound.unidentified).toBe(false);
    const conv = await db.conversation.findFirstOrThrow({ where: { id: inbound.conversationId } });
    expect(conv.contactId).toBeTruthy();
  });
});
