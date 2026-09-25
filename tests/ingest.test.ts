import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAtendimentoService } from "@/lib/services/atendimento-service";
import { enrichConversationPeerProfile, schedulePeerProfileEnrichment } from "@/lib/services/peer-avatar-service";
import { cadastroService } from "@/lib/services/cadastro-service";
import { hashPassword } from "@/lib/auth/session";
import { phoneFromWhatsAppLid } from "@/lib/channels/evolution-webhook";
import * as evolutionPeerProfile from "@/lib/channels/evolution-peer-profile";
import { AppError } from "@/lib/api/errors";
import { assertNotOfficeDatabase } from "./assert-not-office-db";

vi.mock("@/lib/services/peer-avatar-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/peer-avatar-service")>();
  return {
    ...actual,
    schedulePeerProfileEnrichment: vi.fn(),
  };
});

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

    const spy = vi.spyOn(db.message, "findUnique").mockResolvedValueOnce(null);
    const raced = await svc.ingestInbound({
      waMessageId,
      fromPhone,
      body: "Olá, preciso de orientação",
      connectionType: "dev_mock",
    });
    spy.mockRestore();
    expect(raced.created).toBe(false);
    expect(raced.messageId).toBe(first.messageId);

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
    const lidConv = await db.conversation.findFirstOrThrow({ where: { id: first.conversationId } });
    expect(lidConv.peerLid).toBe(lidPhone);
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

  it("reuses the same conversation when a later LID arrives after the phone was saved", async () => {
    const suffix = `${Date.now()}`;
    const lidPhone = phoneFromWhatsAppLid(`${suffix.slice(-10)}99887766@lid`);
    expect(lidPhone).toBeTruthy();
    const first = await svc.ingestInbound({
      waMessageId: `lid-keep-a-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "primeira",
      connectionType: "dev_mock",
    });
    const realPhone = `+55115${suffix.slice(-8)}`;
    await db.conversation.update({
      where: { id: first.conversationId },
      data: { peerPhoneE164: realPhone },
    });
    const second = await svc.ingestInbound({
      waMessageId: `lid-keep-b-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "segunda so com lid",
      connectionType: "dev_mock",
    });
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.created).toBe(true);
    const conv = await db.conversation.findFirstOrThrow({ where: { id: first.conversationId } });
    expect(conv.peerPhoneE164).toBe(realPhone);
    expect(conv.peerLid).toBe(lidPhone);
    expect(await db.contact.count({ where: { phoneE164: lidPhone! } })).toBe(0);
  });

  it("relinks a saved contact when enrich resolves that phone and does not create a contact", async () => {
    const suffix = `${Date.now()}`;
    const lidPhone = phoneFromWhatsAppLid(`${suffix.slice(-10)}11223344@lid`);
    expect(lidPhone).toBeTruthy();
    const realPhone = `+55114${suffix.slice(-8)}`;
    const condo = await db.condominium.create({ data: { nome: `Relink ${suffix}` } });
    const contact = await db.contact.create({
      data: { nome: `Salvo ${suffix}`, phoneE164: realPhone, condominiumId: condo.id },
    });
    const beforeContacts = await db.contact.count();
    const inbound = await svc.ingestInbound({
      waMessageId: `relink-${suffix}`,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "lid sem identity",
      connectionType: "dev_mock",
    });
    expect(inbound.unidentified).toBe(true);
    expect(inbound.triageId).toBeNull();

    await enrichConversationPeerProfile(inbound.conversationId, db, {
      resolvePhone: async () => realPhone,
    });

    const conv = await db.conversation.findFirstOrThrow({ where: { id: inbound.conversationId } });
    expect(conv.contactId).toBe(contact.id);
    expect(conv.condominiumId).toBe(condo.id);
    expect(conv.unidentified).toBe(false);
    expect(conv.peerPhoneE164).toBe(realPhone);
    expect(conv.peerLid).toBe(lidPhone);
    const triage = await db.triageItem.findUnique({ where: { conversationId: conv.id } });
    expect(triage?.status).toBe("aberto");
    const identities = await db.contactIdentity.findMany({ where: { contactId: contact.id } });
    expect(identities.map((row) => row.value)).toEqual(expect.arrayContaining([realPhone, lidPhone]));
    expect(await db.contact.count()).toBe(beforeContacts);
  });

  it("deep enrich promotes LID phone via resolvePhoneForLidPeer", async () => {
    const suffix = `${Date.now()}`;
    const lidPhone = phoneFromWhatsAppLid(`${suffix.slice(-10)}55667788@lid`);
    expect(lidPhone).toBeTruthy();
    const realPhone = `+55115${suffix.slice(-8)}`;
    const waMessageId = `deep-puxar-${suffix}`;
    const inbound = await svc.ingestInbound({
      waMessageId,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "lid deep puxar",
      connectionType: "dev_mock",
      peerDisplayName: "Contato Deep",
    });
    expect(inbound.unidentified).toBe(true);

    const spy = vi
      .spyOn(evolutionPeerProfile, "resolvePhoneForLidPeer")
      .mockResolvedValue(realPhone);
    try {
      const result = await enrichConversationPeerProfile(inbound.conversationId, db, {
        deep: true,
        waMessageId,
      });
      expect(spy).toHaveBeenCalledWith(
        lidPhone,
        expect.objectContaining({ deep: true, waMessageId, pushName: "Contato Deep" }),
      );
      const conv = await db.conversation.findFirstOrThrow({ where: { id: result.conversationId } });
      expect(conv.peerPhoneE164).toBe(realPhone);
      expect(conv.peerLid).toBe(lidPhone);
    } finally {
      spy.mockRestore();
    }
  });

  it("schedules deep peer enrich for LID inbound and not for a real phone", async () => {
    const schedule = vi.mocked(schedulePeerProfileEnrichment);
    schedule.mockClear();
    const suffix = `${Date.now()}`;
    const lidPhone = phoneFromWhatsAppLid(`${suffix.slice(-10)}99887766@lid`);
    const waMessageId = `sched-lid-${suffix}`;
    const inbound = await svc.ingestInbound({
      waMessageId,
      fromPhone: lidPhone!,
      waLid: lidPhone,
      body: "lid schedule deep",
      connectionType: "dev_mock",
    });
    expect(schedule).toHaveBeenCalledWith(
      inbound.conversationId,
      expect.objectContaining({ deep: true, waMessageId }),
    );

    schedule.mockClear();
    const fromPhone = `+55119${String(Date.now()).slice(-8)}`;
    const e164Id = `sched-pn-${suffix}`;
    const pn = await svc.ingestInbound({
      waMessageId: e164Id,
      fromPhone,
      body: "phone schedule shallow",
      connectionType: "dev_mock",
    });
    const opts = schedule.mock.calls[0]?.[1] as { deep?: boolean; waMessageId?: string };
    expect(opts.waMessageId).toBe(e164Id);
    expect(opts.deep).toBeUndefined();
    expect(pn.conversationId).toBeTruthy();
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

  it("ingestOwnOutbound skips when conversation does not exist", async () => {
    const fromPhone = `+55119${String(Date.now()).slice(-8)}`;
    const waMessageId = `own-none-${Date.now()}`;
    const result = await svc.ingestOwnOutbound({
      waMessageId,
      fromPhone,
      body: "falou no celular",
      connectionType: "dev_mock",
    });
    expect(result.created).toBe(false);
    expect(result.conversationId).toBeNull();
    expect(await db.message.count({ where: { waMessageId } })).toBe(0);
  });

  it("ingestOwnOutbound stores direction out without reopening triage", async () => {
    const suffix = `${Date.now()}`;
    const fromPhone = `+55118${suffix.slice(-8)}`;
    const inbound = await svc.ingestInbound({
      waMessageId: `own-in-${suffix}`,
      fromPhone,
      body: "cliente",
      connectionType: "dev_mock",
    });
    expect(inbound.triageId).toBeNull();

    const archivedTriage = await db.triageItem.create({
      data: { conversationId: inbound.conversationId, status: "arquivado" },
    });

    const sentAt = new Date("2024-06-15T14:02:00.000Z").toISOString();
    const own = await svc.ingestOwnOutbound({
      waMessageId: `own-out-${suffix}`,
      fromPhone,
      body: "resposta no celular",
      sentAt,
      connectionType: "dev_mock",
    });
    expect(own.created).toBe(true);
    expect(own.conversationId).toBe(inbound.conversationId);

    const msg = await db.message.findFirstOrThrow({ where: { waMessageId: `own-out-${suffix}` } });
    expect(msg.direction).toBe("out");
    expect(msg.visibility).toBe("publica");
    expect(msg.sendStatus).toBe("sent");
    expect(msg.body).toBe("resposta no celular");
    expect(msg.createdAt.toISOString()).toBe(sentAt);

    const triage = await db.triageItem.findFirstOrThrow({ where: { id: archivedTriage.id } });
    expect(triage.status).toBe("arquivado");

    const echo = await svc.ingestOwnOutbound({
      waMessageId: `own-out-${suffix}`,
      fromPhone,
      body: "resposta no celular",
      connectionType: "dev_mock",
    });
    expect(echo.created).toBe(false);
    expect(echo.messageId).toBe(own.messageId);
    expect(await db.message.count({ where: { waMessageId: `own-out-${suffix}` } })).toBe(1);
  });

  it("ingestOwnOutbound links race twin with null waMessageId instead of duplicating", async () => {
    const suffix = `${Date.now()}`;
    const fromPhone = `+55117${suffix.slice(-8)}`;
    const inbound = await svc.ingestInbound({
      waMessageId: `race-in-${suffix}`,
      fromPhone,
      body: "cliente",
      connectionType: "dev_mock",
    });
    const pending = await db.message.create({
      data: {
        conversationId: inbound.conversationId,
        direction: "out",
        visibility: "publica",
        sendStatus: "pending",
        body: "enviada pelo portal",
        waMessageId: null,
      },
    });
    const linked = await svc.ingestOwnOutbound({
      waMessageId: `race-wa-${suffix}`,
      fromPhone,
      body: "enviada pelo portal",
      connectionType: "dev_mock",
    });
    expect(linked.created).toBe(false);
    expect(linked.messageId).toBe(pending.id);
    const updated = await db.message.findFirstOrThrow({ where: { id: pending.id } });
    expect(updated.waMessageId).toBe(`race-wa-${suffix}`);
    expect(updated.sendStatus).toBe("sent");
    expect(await db.message.count({ where: { conversationId: inbound.conversationId, body: "enviada pelo portal" } })).toBe(
      1,
    );
  });

  it("removeFromSystem drops the inbox thread and keeps the ticket", async () => {
    const suffix = `${Date.now()}`;
    const fromPhone = `+55116${suffix.slice(-8)}`;
    const inbound = await svc.ingestInbound({
      waMessageId: `rm-${suffix}`,
      fromPhone,
      body: "apagar só no sistema",
      connectionType: "dev_mock",
    });
    const admin = await db.user.create({
      data: {
        email: `rm-admin-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "admin",
      },
    });
    const staff = await db.user.create({
      data: {
        email: `rm-staff-${suffix}@juricon.local`,
        passwordHash: await hashPassword("x"),
        role: "funcionario",
      },
    });
    const condo = await db.condominium.create({ data: { nome: `Rm ${suffix}` } });
    const contact = await db.contact.create({
      data: { nome: "Rm Contato", phoneE164: fromPhone, condominiumId: condo.id },
    });
    const ticket = await db.ticket.create({
      data: {
        protocol: `RM${suffix.slice(-6)}`,
        title: "Chamado que fica",
        priority: "media",
        category: "outro",
        origin: "whatsapp",
        condominiumId: condo.id,
        contactId: contact.id,
        conversationId: inbound.conversationId,
        createdById: admin.id,
      },
    });

    await expect(svc.removeFromSystem(staff, inbound.conversationId)).rejects.toBeInstanceOf(AppError);

    await svc.removeFromSystem(admin, inbound.conversationId);

    expect(await db.conversation.findFirst({ where: { id: inbound.conversationId } })).toBeNull();
    expect(await db.message.count({ where: { conversationId: inbound.conversationId } })).toBe(0);
    const kept = await db.ticket.findFirstOrThrow({ where: { id: ticket.id } });
    expect(kept.conversationId).toBeNull();
    expect(kept.protocol).toBe(ticket.protocol);

    const again = await svc.ingestInbound({
      waMessageId: `rm-next-${suffix}`,
      fromPhone,
      body: "conversa nova",
      connectionType: "dev_mock",
    });
    expect(again.created).toBe(true);
    expect(again.conversationId).not.toBe(inbound.conversationId);
  });
});
