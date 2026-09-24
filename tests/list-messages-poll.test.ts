import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient, User } from "@prisma/client";

const schedule = vi.fn();

vi.mock("@/lib/services/peer-avatar-service", () => ({
  schedulePeerProfileEnrichment: (...args: unknown[]) => schedule(...args),
  peerAvatarPublicUrl: () => null,
}));

import { createAtendimentoService } from "@/lib/services/atendimento-service";

describe("listMessages poll", () => {
  beforeEach(() => {
    schedule.mockClear();
  });

  it("does not call Evolution enrich while polling messages", async () => {
    const db = {
      conversation: {
        findFirst: async () => ({
          id: "c1",
          tickets: [],
        }),
      },
      message: {
        count: async () => 0,
      },
    } as unknown as PrismaClient;
    const svc = createAtendimentoService(db);
    const user = { id: "admin-1", role: "admin" } as User;
    const page = await svc.listMessages(user, "c1", 1, 50);
    expect(page.total).toBe(0);
    expect(page.items).toEqual([]);
    expect(schedule).not.toHaveBeenCalled();
  });
});
