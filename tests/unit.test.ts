import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { assertAdmin } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/session";
import { whatsappService } from "@/lib/services/whatsapp-service";
import { assertCsrf } from "@/lib/api/handler";
import { clientIp, rateLimit } from "@/lib/api/rate-limit";
import {
  brazilWhatsAppNumberVariants,
  describeEvolutionError,
  evolutionLogoutAlreadyOff,
  evolutionSendDestinations,
  evolutionSendLooksLikeLegacySchema,
  isBaileysSessionOpen,
  pickRicherEvolutionError,
  whatsAppNumberFromE164,
} from "@/lib/channels/evolution-send";
import { e164LookupValues, sendableWhatsAppE164 } from "@/lib/phone/identity";
import { conversationPhoneLabel, formatWhatsAppPeer, WHATSAPP_HIDDEN_NUMBER_LABEL } from "@/lib/phone/display";
import { isInOperationalFlow } from "@/lib/services/operational-flow";
import { contactNameMatchesPushName, lidJidsMatchingPlaceholder, pickUniqueLidPlaceholder } from "@/lib/channels/evolution-lid-map";
import { phoneFromWhatsAppLid } from "@/lib/channels/evolution-webhook";

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

  it("prefers CF-Connecting-IP over X-Forwarded-For", () => {
    const request = new Request("http://127.0.0.1:3010/api/auth/login", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.1, 10.0.0.1",
      },
    });
    expect(clientIp(request)).toBe("203.0.113.10");
  });
});

describe("csrf behind public URL", () => {
  it("accepts Origin equal to APP_PUBLIC_URL when request.url is localhost", () => {
    const prev = process.env.APP_PUBLIC_URL;
    process.env.APP_PUBLIC_URL = "https://juricon.example.com";
    const request = new Request("http://127.0.0.1:3010/api/tickets", {
      method: "POST",
      headers: { origin: "https://juricon.example.com" },
    });
    expect(() => assertCsrf(request)).not.toThrow();
    if (prev) process.env.APP_PUBLIC_URL = prev;
    else delete process.env.APP_PUBLIC_URL;
  });

  it("rejects a foreign Origin even with APP_PUBLIC_URL set", () => {
    const prev = process.env.APP_PUBLIC_URL;
    process.env.APP_PUBLIC_URL = "https://juricon.example.com";
    const request = new Request("http://127.0.0.1:3010/api/tickets", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(() => assertCsrf(request)).toThrowError(AppError);
    if (prev) process.env.APP_PUBLIC_URL = prev;
    else delete process.env.APP_PUBLIC_URL;
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

  it("flattens Evolution message arrays instead of only Bad Request", () => {
    const msg = describeEvolutionError(400, { error: "Bad Request", message: ["text must be a string"] }, "text");
    expect(msg).toContain("text must be a string");
  });

  it("detects legacy sendText schema errors only", () => {
    expect(evolutionSendLooksLikeLegacySchema({ message: ["text must be a string"], error: "Bad Request" })).toBe(true);
    expect(evolutionSendLooksLikeLegacySchema({ message: "exists: false", error: "Bad Request" })).toBe(false);
  });

  it("prefers exists:false over generic Bad Request", () => {
    const msg = pickRicherEvolutionError("text", [
      { status: 400, json: { message: "exists: false", error: "Bad Request" } },
      { status: 400, json: { error: "Bad Request", message: ["text must be a string"] } },
    ]);
    expect(msg).toContain("exists: false");
  });

  it("adds or removes Brazil ninth digit once", () => {
    expect(brazilWhatsAppNumberVariants("5511999990000")).toEqual(["5511999990000", "551199990000"]);
    expect(brazilWhatsAppNumberVariants("551199990000")).toEqual(["551199990000", "5511999990000"]);
    expect(brazilWhatsAppNumberVariants("5511999990000")[0]).toBe("5511999990000");
    expect(e164LookupValues("+5511999990000")).toEqual(["+5511999990000", "+551199990000"]);
  });

  it("does not show LID placeholder as a phone number", () => {
    expect(formatWhatsAppPeer("+999885504524400")).toBe(WHATSAPP_HIDDEN_NUMBER_LABEL);
    expect(conversationPhoneLabel(null, "+999885504524400")).toBe(WHATSAPP_HIDDEN_NUMBER_LABEL);
    expect(formatWhatsAppPeer("+5511988880000")).toBe("+55 (11) 98888-0000");
    expect(formatWhatsAppPeer("+553898034252")).toBe("+55 (38) 99803-4252");
    expect(conversationPhoneLabel("+5511999990000", "+999111")).toBe("+55 (11) 99999-0000");
  });

  it("maps a unique Evolution LID chat by contact first name", () => {
    expect(contactNameMatchesPushName("ANDRE", "Andre Escritorio")).toBe(true);
    expect(contactNameMatchesPushName("ANDRE SILVA", "Andre Escritorio")).toBe(false);
    expect(contactNameMatchesPushName("ANA", "Ana Paula")).toBe(false);
    const lid = phoneFromWhatsAppLid("142112045666497@lid");
    expect(
      pickUniqueLidPlaceholder(
        [
          { remoteJid: "142112045666497@lid", pushName: "Andre Escritorio" },
          { remoteJid: "43035656245495@lid", pushName: "Ezequiel" },
        ],
        "ANDRE",
      ),
    ).toBe(lid);
    expect(
      pickUniqueLidPlaceholder(
        [
          { remoteJid: "142112045666497@lid", pushName: "Andre Escritorio" },
          { remoteJid: "199999999999999@lid", pushName: "Andre Outro" },
        ],
        "ANDRE",
      ),
    ).toBeNull();
  });

  it("operational flow and sendable WhatsApp number", () => {
    expect(isInOperationalFlow(null)).toBe(false);
    expect(isInOperationalFlow({ condominiumId: null })).toBe(false);
    expect(isInOperationalFlow({ condominiumId: "x" })).toBe(true);
    expect(sendableWhatsAppE164({ peerPhoneE164: "+5511988880000" })).toBe("+5511988880000");
    expect(sendableWhatsAppE164({ peerPhoneE164: "+999111" })).toBeNull();
  });

  it("sends WhatsApp to LID jid when the peer has no real phone", () => {
    expect(evolutionSendDestinations("142112045666497@lid")).toEqual(["142112045666497@lid"]);
    expect(evolutionSendDestinations("+999112045666497")).toEqual(["112045666497@lid"]);
    expect(evolutionSendDestinations("+5511988880000")[0]).toBe("5511988880000");
    const placeholder = phoneFromWhatsAppLid("142112045666497@lid");
    expect(
      lidJidsMatchingPlaceholder(
        [
          { remoteJid: "142112045666497@lid" },
          { remoteJid: "556198980080@s.whatsapp.net" },
        ],
        placeholder!,
      ),
    ).toEqual(["142112045666497@lid"]);
  });

  it("treats Evolution logout 400/404 as already disconnected", () => {
    expect(evolutionLogoutAlreadyOff(400)).toBe(true);
    expect(evolutionLogoutAlreadyOff(404)).toBe(true);
    expect(evolutionLogoutAlreadyOff(500)).toBe(false);
  });
});
