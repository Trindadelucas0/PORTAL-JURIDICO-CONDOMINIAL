import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const fetchEvolutionContacts = vi.fn(async () => []);
const fetchEvolutionChatRows = vi.fn(async () => []);

vi.mock("@/lib/channels/evolution-lid-map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/channels/evolution-lid-map")>();
  return {
    ...actual,
    fetchEvolutionContacts: () => fetchEvolutionContacts(),
    fetchEvolutionChatRows: () => fetchEvolutionChatRows(),
  };
});

import { enqueuePeerProfileEnrichment } from "@/lib/services/peer-avatar-service";

describe("peer profile enrich schedule", () => {
  afterEach(() => {
    fetchEvolutionContacts.mockClear();
    fetchEvolutionChatRows.mockClear();
  });

  it("runs one Evolution lookup while the first enrich of that conversation is in flight", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchEvolutionContacts.mockImplementation(async () => {
      await gate;
      return [];
    });
    fetchEvolutionChatRows.mockResolvedValue([]);

    const row = {
      id: "conv-enrich-1",
      connectionId: "conn-1",
      peerPhoneE164: "+5511999887766",
      peerLid: null,
      peerDisplayName: null,
      peerAvatarKey: null,
      peerAvatarFetchedAt: null,
      contactId: null,
    };
    const db = {
      conversation: {
        findFirst: async () => row,
        update: async () => row,
      },
      contact: { update: async () => ({}) },
    } as unknown as PrismaClient;

    const first = enqueuePeerProfileEnrichment("conv-enrich-1", undefined, db);
    const second = enqueuePeerProfileEnrichment("conv-enrich-1", undefined, db);
    expect(second).toBe(first);
    release();
    await first;
    expect(fetchEvolutionContacts).toHaveBeenCalledTimes(1);
  });
});
