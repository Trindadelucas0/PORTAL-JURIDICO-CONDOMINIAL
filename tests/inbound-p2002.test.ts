import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { createAtendimentoService } from "@/lib/services/atendimento-service";

function uniqueConflict() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.0.0",
  });
}

describe("ingestInbound P2002", () => {
  it("returns created false when waMessageId unique constraint races", async () => {
    const conversation = {
      id: "c1",
      connectionId: "conn1",
      peerPhoneE164: "+5511999887766",
      peerLid: null,
      peerDisplayName: null,
      unidentified: true,
      contactId: null,
      condominiumId: null,
      peerAvatarKey: null,
    };
    const existing = {
      id: "m1",
      conversationId: "c1",
      conversation: { unidentified: true, triageItem: null },
    };
    const db = {
      message: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existing),
        create: vi.fn().mockRejectedValue(uniqueConflict()),
      },
      channelConnection: {
        findFirst: async () => ({ id: "conn1", type: "dev_mock" }),
      },
      conversation: {
        findMany: async () => [conversation],
        findFirst: async () => conversation,
        update: async () => conversation,
      },
      contact: { findFirst: async () => null },
      contactIdentity: { findFirst: async () => null },
      ticket: { findFirst: async () => null },
    } as unknown as PrismaClient;

    const svc = createAtendimentoService(db);
    const result = await svc.ingestInbound({
      waMessageId: "WA-DUP",
      fromPhone: "+5511999887766",
      body: "oi",
      connectionType: "dev_mock",
    });
    expect(result.created).toBe(false);
    expect(result.messageId).toBe("m1");
    expect(result.conversationId).toBe("c1");
  });
});
