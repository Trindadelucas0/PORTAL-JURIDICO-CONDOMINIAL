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

import {
  DEEP_PHONE_RETRY_MS,
  enqueuePeerProfileEnrichment,
} from "@/lib/services/peer-avatar-service";

describe("peer profile enrich schedule", () => {
  afterEach(() => {
    fetchEvolutionContacts.mockClear();
    fetchEvolutionChatRows.mockClear();
    vi.useRealTimers();
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
      contact: { findFirst: async () => null, update: async () => ({}) },
      contactIdentity: { findFirst: async () => null },
    } as unknown as PrismaClient;

    const first = enqueuePeerProfileEnrichment("conv-enrich-1", undefined, db);
    const second = enqueuePeerProfileEnrichment("conv-enrich-1", undefined, db);
    expect(second).toBe(first);
    release();
    await first;
    expect(fetchEvolutionContacts).toHaveBeenCalledTimes(1);
  });

  it("retries deep enrich once after 5s when the peer is still LID", async () => {
    vi.useFakeTimers();
    fetchEvolutionContacts.mockResolvedValue([]);
    fetchEvolutionChatRows.mockResolvedValue([]);
    const row = {
      id: "conv-lid-retry",
      connectionId: "conn-1",
      peerPhoneE164: "+999123456789012",
      peerLid: "+999123456789012",
      peerDisplayName: null,
      peerAvatarKey: "avatars/x.jpg",
      peerAvatarFetchedAt: new Date(),
      contactId: null,
    };
    const db = {
      conversation: {
        findFirst: async () => row,
        update: async () => row,
      },
      contact: { findFirst: async () => null, update: async () => ({}) },
      contactIdentity: { findFirst: async () => null },
    } as unknown as PrismaClient;

    await enqueuePeerProfileEnrichment("conv-lid-retry", { deep: true, waMessageId: "wa-1" }, db);
    expect(fetchEvolutionContacts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DEEP_PHONE_RETRY_MS);
    expect(fetchEvolutionContacts).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(DEEP_PHONE_RETRY_MS);
    expect(fetchEvolutionContacts).toHaveBeenCalledTimes(2);
  });

  it("does not retry when deep is off", async () => {
    vi.useFakeTimers();
    fetchEvolutionContacts.mockResolvedValue([]);
    fetchEvolutionChatRows.mockResolvedValue([]);
    const row = {
      id: "conv-lid-shallow",
      connectionId: "conn-1",
      peerPhoneE164: "+999123456789012",
      peerLid: "+999123456789012",
      peerDisplayName: "Nome",
      peerAvatarKey: "avatars/x.jpg",
      peerAvatarFetchedAt: new Date(),
      contactId: null,
    };
    const db = {
      conversation: {
        findFirst: async () => row,
        update: async () => row,
      },
      contact: { findFirst: async () => null, update: async () => ({}) },
      contactIdentity: { findFirst: async () => null },
    } as unknown as PrismaClient;

    await enqueuePeerProfileEnrichment("conv-lid-shallow", { waMessageId: "wa-2" }, db);
    await vi.advanceTimersByTimeAsync(DEEP_PHONE_RETRY_MS);
    expect(fetchEvolutionContacts).toHaveBeenCalledTimes(1);
  });
});
