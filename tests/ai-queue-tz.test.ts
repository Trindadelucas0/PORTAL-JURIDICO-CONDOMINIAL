import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { claimQueuedInbound } from "@/lib/ai/process-conversation";
import { assertNotOfficeDatabase } from "./assert-not-office-db";

const db = new PrismaClient();

describe("claimQueuedInbound timezone", () => {
  beforeAll(async () => {
    await db.$connect();
    await assertNotOfficeDatabase(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("claims a past runAfter when the session is America/Sao_Paulo", async () => {
    await db.$executeRaw`SET TIME ZONE 'America/Sao_Paulo'`;
    const connection =
      (await db.channelConnection.findFirst()) ??
      (await db.channelConnection.create({ data: { type: "dev_mock", status: "open", label: "Dev / mock" } }));
    const conversation = await db.conversation.create({
      data: {
        connectionId: connection.id,
        peerPhoneE164: `+55119${String(Date.now()).slice(-8)}`,
        unidentified: true,
      },
    });
    const job = await db.aiJob.create({
      data: {
        type: "ai.inbound",
        idempotencyKey: `tz-${conversation.id}`,
        conversationId: conversation.id,
        status: "queued",
        runAfter: new Date(Date.now() - 60_000),
      },
    });
    const claimed = await claimQueuedInbound(db, conversation.id);
    expect(claimed.map((row) => row.id)).toContain(job.id);
    await db.aiJob.delete({ where: { id: job.id } }).catch(() => undefined);
    await db.conversation.delete({ where: { id: conversation.id } }).catch(() => undefined);
  });
});
