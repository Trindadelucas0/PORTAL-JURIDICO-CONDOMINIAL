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

  it("creates conversation without triage for unknown numbers; never creates ticket", async () => {
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
    expect(first.triageId).toBeNull();
    expect(first.unidentified).toBe(true);
    const conv = await db.conversation.findFirstOrThrow({ where: { id: first.conversationId } });
    expect(conv.peerPhoneE164).toBe(fromPhone);
    expect(await db.triageItem.count({ where: { conversationId: first.conversationId } })).toBe(0);

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

  it("keeps the same conversation for two LID messages and after enroll", async () => {
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
    expect(first.triageId).toBeNull();
    expect(await db.triageItem.count({ where: { conversationId: first.conversationId } })).toBe(0);

    const admin = await db.user.create({
      data: {
        email: `lid-admin-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Lid ${suffix}` } });
    const realPhone = `+55117${String(Date.now()).slice(-8)}`;
    const enrolled = await cadastroService.enrollConversation(admin, first.conversationId, {
      nome: "Lid Contato",
      condominiumId: condo.id,
      phone: realPhone,
    });
    expect(enrolled.triage.id).toBeTruthy();
    const third = await svc.ingestInbound({
      waMessageId: `lid-c-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "depois de cadastrar",
      connectionType: "dev_mock",
    });
    expect(third.conversationId).toBe(first.conversationId);
    expect(third.unidentified).toBe(false);
    expect(third.triageId).toBeTruthy();
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
    expect(inbound.triageId).toBeTruthy();
    const conv = await db.conversation.findFirstOrThrow({ where: { id: inbound.conversationId } });
    expect(conv.contactId).toBeTruthy();
    const second = await svc.ingestInbound({
      waMessageId: `var-2-${suffix}`,
      fromPhone: withoutNine,
      body: "de novo, sem identificar",
      connectionType: "dev_mock",
    });
    expect(second.conversationId).toBe(inbound.conversationId);
    expect(second.unidentified).toBe(false);
    expect(second.triageId).toBe(inbound.triageId);
  });

  it("links a condominium contact to a later LID inbound after the LID alias exists", async () => {
    const suffix = `${Date.now()}`;
    const lidPhone = phoneFromWhatsAppLid(`${suffix.slice(-10)}142112045@lid`);
    expect(lidPhone).toBeTruthy();
    const realPhone = `+55116${String(Date.now()).slice(-8)}`;
    const condo = await db.condominium.create({ data: { nome: `LidCad ${suffix}` } });
    const contact = await cadastroService.createContact({
      nome: `Cadastro ${suffix}`,
      phone: realPhone,
      condominiumId: condo.id,
    });
    await db.contactIdentity.create({
      data: { contactId: contact.id, kind: "lid", value: lidPhone! },
    });
    const inbound = await svc.ingestInbound({
      waMessageId: `lidcad-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "depois do cadastro no condominio",
      connectionType: "dev_mock",
    });
    expect(inbound.unidentified).toBe(false);
    expect(inbound.triageId).toBeTruthy();
    const conv = await db.conversation.findFirstOrThrow({ where: { id: inbound.conversationId } });
    expect(conv.contactId).toBe(contact.id);
    expect(conv.condominiumId).toBe(condo.id);
  });
});
