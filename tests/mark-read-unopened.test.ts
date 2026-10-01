import { describe, expect, it, vi } from "vitest";
import type { PrismaClient, User } from "@prisma/client";

vi.mock("@/lib/services/peer-avatar-service", () => ({
  schedulePeerProfileEnrichment: () => undefined,
  peerAvatarPublicUrl: () => null,
}));

import { createAtendimentoService } from "@/lib/services/atendimento-service";

type Row = { id: string; direction: "in" | "out"; createdAt: Date };

function fakeDb(rows: Row[], reads: Array<{ lastReadAt: Date }>) {
  const calls: string[] = [];
  const db = {
    conversation: { findFirst: async () => ({ id: "c1", tickets: [] }) },
    conversationRead: {
      findMany: async () => {
        calls.push("reads");
        return reads;
      },
      upsert: async (args: { create: { lastReadAt: Date } }) => {
        calls.push("upsert");
        return { userId: "admin-1", conversationId: "c1", lastReadAt: args.create.lastReadAt };
      },
    },
    message: {
      findMany: async (args: {
        where: { conversationId: string; direction: "in"; createdAt?: { gt: Date } };
        orderBy: { createdAt: "desc" };
        take: number;
      }) => {
        calls.push("messages");
        const cutoff = args.where.createdAt?.gt;
        return rows
          .filter((row) => row.direction === args.where.direction && (!cutoff || row.createdAt > cutoff))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take)
          .map((row) => ({ id: row.id }));
      },
    },
  } as unknown as PrismaClient;
  return { db, calls };
}

const admin = { id: "admin-1", role: "admin" } as User;
const at = (minute: number) => new Date(Date.UTC(2026, 8, 29, 12, minute));

describe("markRead devolve as não abertas", () => {
  it("inbound antes do maior lastReadAt fica de fora; as depois entram, antes do upsert", async () => {
    const { db, calls } = fakeDb(
      [
        { id: "velha", direction: "in", createdAt: at(1) },
        { id: "saida", direction: "out", createdAt: at(6) },
        { id: "nova-1", direction: "in", createdAt: at(7) },
        { id: "nova-2", direction: "in", createdAt: at(8) },
      ],
      [{ lastReadAt: at(3) }, { lastReadAt: at(5) }],
    );
    const row = await createAtendimentoService(db).markRead(admin, "c1");
    expect(row.unopenedMessageIds).toEqual(["nova-1", "nova-2"]);
    expect(calls).toEqual(["reads", "messages", "upsert"]);
  });

  it("sem leitura anterior entram todas, no máximo as 40 mais novas", async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: `m${i}`, direction: "in" as const, createdAt: at(i) }));
    const { db } = fakeDb(rows, []);
    const row = await createAtendimentoService(db).markRead(admin, "c1");
    expect(row.unopenedMessageIds).toHaveLength(40);
    expect(row.unopenedMessageIds[0]).toBe("m5");
    expect(row.unopenedMessageIds[39]).toBe("m44");
  });
});
