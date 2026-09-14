import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { assertAdmin } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/session";
import { normalizeE164 } from "@/lib/phone/e164";
import { whatsappService } from "@/lib/services/whatsapp-service";
import { rateLimit } from "@/lib/api/rate-limit";
import { describeEvolutionError, isBaileysSessionOpen, whatsAppNumberFromE164 } from "@/lib/channels/evolution-send";

describe("login primitives", () => {
  it("hashes and verifies password without storing plaintext", async () => {
    const hash = await hashPassword("secret-value");
    expect(hash).not.toContain("secret-value");
    expect(await verifyPassword("secret-value", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rate-limits login key after threshold", () => {
    const key = `test-login-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(key, 10, 60_000).ok).toBe(true);
    }
    expect(rateLimit(key, 10, 60_000).ok).toBe(false);
  });
});

describe("authz", () => {
  it("returns 403 for funcionario on requireAdmin", () => {
    expect(() => assertAdmin({ role: "funcionario" })).toThrowError(AppError);
    try {
      assertAdmin({ role: "funcionario" });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(403);
      expect((e as AppError).code).toBe("FORBIDDEN");
    }
  });

  it("allows admin", () => {
    expect(() => assertAdmin({ role: "admin" })).not.toThrow();
  });
});

describe("webhook fail-closed", () => {
  it("rejects when secret env is missing", () => {
    const prev = process.env.EVOLUTION_WEBHOOK_SECRET;
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    expect(() => whatsappService.assertWebhookSecret("anything")).toThrowError(AppError);
    if (prev) process.env.EVOLUTION_WEBHOOK_SECRET = prev;
  });

  it("accepts matching header secret", () => {
    const prev = process.env.EVOLUTION_WEBHOOK_SECRET;
    process.env.EVOLUTION_WEBHOOK_SECRET = "local-webhook-secret";
    expect(() => whatsappService.assertWebhookSecret("local-webhook-secret")).not.toThrow();
    if (prev) process.env.EVOLUTION_WEBHOOK_SECRET = prev;
    else delete process.env.EVOLUTION_WEBHOOK_SECRET;
  });
});

describe("schema contract", () => {
  it("defines Ticket without vector columns or DocumentChunk", () => {
    const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/model Ticket\b/);
    expect(schema).not.toMatch(/model DocumentChunk\b/);
    expect(schema).not.toMatch(/embedding/);
    expect(schema).not.toMatch(/pgvector/);
  });
});

describe("evolution send errors", () => {
  it("keeps only digits for WhatsApp number", () => {
    expect(whatsAppNumberFromE164("+55 11 99999-0000")).toBe("5511999990000");
  });

  it("treats open and connected as live session", () => {
    expect(isBaileysSessionOpen("open")).toBe(true);
    expect(isBaileysSessionOpen("connected")).toBe(true);
    expect(isBaileysSessionOpen("connecting")).toBe(false);
  });

  it("describes Evolution 400 body without leaking secrets", () => {
    const msg = describeEvolutionError(400, { message: "exists: false", error: "Bad Request" }, "text");
    expect(msg).toContain("400");
    expect(msg).toContain("exists: false");
    expect(msg.toLowerCase()).not.toContain("apikey");
  });
});
