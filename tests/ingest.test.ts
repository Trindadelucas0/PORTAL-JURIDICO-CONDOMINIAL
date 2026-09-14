import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAtendimentoService } from "@/lib/services/atendimento-service";

const db = new PrismaClient();
const svc = createAtendimentoService(db);

describe("inbound ingest", () => {
  beforeAll(async () => {
    await db.$connect();
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
    const beforeTickets = await db.ticket.count();
    const first = await svc.ingestInbound({
      waMessageId,
      fromPhone: "+5511988880000",
      body: "Olá, preciso de orientação",
      connectionType: "dev_mock",
    });
    expect(first.created).toBe(true);
    expect(first.triageId).toBeTruthy();
    expect(first.unidentified).toBe(true);

    const second = await svc.ingestInbound({
      waMessageId,
      fromPhone: "+5511988880000",
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
});
