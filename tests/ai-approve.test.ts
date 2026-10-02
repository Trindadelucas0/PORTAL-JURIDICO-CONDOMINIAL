import { describe, expect, it, vi } from "vitest";
import type { PrismaClient, User } from "@prisma/client";
import { AppError } from "@/lib/api/errors";

const dispatch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/whatsapp-dispatch", () => ({
  resendFailedMessage: (...args: unknown[]) => dispatch(...args),
  dispatchToWhatsApp: (...args: unknown[]) => dispatch(...args),
  canSendPublicWhatsApp: () => true,
}));

import { FALLBACK_HUMAN_REVIEW } from "@/lib/ai/prompts/inbound-v2";
import { createApprovalService } from "@/lib/services/approval-service";

const user = { id: "admin", role: "admin" } as User;

describe("approve rejected AI draft", () => {
  it("returns 422 and does not call the WhatsApp provider", async () => {
    dispatch.mockClear();
    const db = {
      aiInteraction: {
        findFirst: async () => ({ id: "i1", status: "rejected", conversationId: "c1", ticketId: "t1" }),
      },
    } as unknown as PrismaClient;
    const service = createApprovalService(db);
    try {
      await service.approve(user, "m1");
      throw new Error("expected 422");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(422);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still approves a human draft that has no AI interaction", async () => {
    dispatch.mockClear();
    dispatch.mockResolvedValue({ id: "m-human", sendStatus: "sent" });
    const db = {
      aiInteraction: { findFirst: async () => null },
      message: { findFirst: async () => ({ body: "Segue a orientação do regimento." }) },
    } as unknown as PrismaClient;
    const service = createApprovalService(db);
    await service.approve(user, "m-human");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when the draft is the internal review sentence", async () => {
    dispatch.mockClear();
    const db = {
      aiInteraction: { findFirst: async () => null },
      message: { findFirst: async () => ({ body: `  ${FALLBACK_HUMAN_REVIEW}  ` }) },
    } as unknown as PrismaClient;
    const service = createApprovalService(db);
    await expect(service.approve(user, "m-review")).rejects.toMatchObject({ status: 422 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns 422 when the draft reformulates internal analysis", async () => {
    dispatch.mockClear();
    const db = {
      aiInteraction: { findFirst: async () => null },
      message: { findFirst: async () => ({ body: "O modelo identificou que precisamos revisar internamente o caso." }) },
    } as unknown as PrismaClient;
    const service = createApprovalService(db);
    await expect(service.approve(user, "m-internal")).rejects.toMatchObject({ status: 422 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns 403 when a staff user approves a draft", async () => {
    dispatch.mockClear();
    const staff = { id: "staff", role: "funcionario", podeResponderCliente: true, apenasRascunho: false } as User;
    const db = {
      aiInteraction: { findFirst: async () => null },
      message: { findFirst: async () => ({ body: "Segue o rascunho.", sendStatus: "draft" }) },
    } as unknown as PrismaClient;
    const service = createApprovalService(db);
    await expect(service.approve(staff, "m-draft")).rejects.toMatchObject({
      status: 403,
      message: "Somente a administradora aprova rascunho",
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
