import { describe, expect, it } from "vitest";
import {
  extractMessageText,
  interpretEvolutionWebhook,
  phoneFromWhatsAppLid,
} from "@/lib/channels/evolution-webhook";

describe("interpretEvolutionWebhook", () => {
  it("returns malformed for non-object body", () => {
    expect(interpretEvolutionWebhook(null)).toEqual({ kind: "malformed", reason: "malformed" });
    expect(interpretEvolutionWebhook("x")).toEqual({ kind: "malformed", reason: "malformed" });
  });

  it("extracts a classic messages.upsert object", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: { id: "ABC", remoteJid: "5511988880000@s.whatsapp.net", fromMe: false },
        message: { conversation: "Olá" },
      },
    });
    expect(result).toEqual({
      kind: "messages",
      items: [{ waMessageId: "ABC", fromPhone: "+5511988880000", waLid: null, body: "Olá" }],
    });
  });

  it("accepts data as array", () => {
    const result = interpretEvolutionWebhook({
      event: "MESSAGES_UPSERT",
      data: [
        {
          key: { id: "1", remoteJid: "5511999990000@s.whatsapp.net", fromMe: false },
          message: { conversation: "a" },
        },
        {
          key: { id: "2", remoteJid: "5511888880000@s.whatsapp.net", fromMe: false },
          message: { extendedTextMessage: { text: "b" } },
        },
      ],
    });
    expect(result.kind).toBe("messages");
    if (result.kind === "messages") {
      expect(result.items).toHaveLength(2);
      expect(result.items[1]?.body).toBe("b");
    }
  });

  it("treats null conversation and fromMe 1 without throwing", () => {
    expect(
      interpretEvolutionWebhook({
        event: "messages.upsert",
        data: {
          key: { id: "X", remoteJid: "5511988880000@s.whatsapp.net", fromMe: 1 },
          message: { conversation: null, extendedTextMessage: { text: null } },
        },
      }),
    ).toEqual({ kind: "ignored", reason: "fromMe" });
  });

  it("caches QRCODE_UPDATED fields", () => {
    const result = interpretEvolutionWebhook({
      event: "QRCODE_UPDATED",
      data: {
        qrcode: { base64: `data:image/png;base64,${"A".repeat(50)}`, pairingCode: "123-456" },
      },
    });
    expect(result.kind).toBe("qrcode");
    if (result.kind === "qrcode") {
      expect(result.qr?.length).toBeGreaterThan(40);
      expect(result.pairingCode).toBe("123-456");
    }
  });

  it("ignores group jids", () => {
    expect(
      interpretEvolutionWebhook({
        event: "messages.upsert",
        data: {
          key: { id: "G", remoteJid: "120363@g.us", fromMe: false },
          message: { conversation: "grupo" },
        },
      }),
    ).toEqual({ kind: "ignored", reason: "group" });
  });

  it("ingests @lid without remoteJidAlt instead of dropping the message", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      sender: "553898100827@s.whatsapp.net",
      data: {
        key: { id: "LIDONLY", remoteJid: "43035656245495@lid", fromMe: false },
        message: { conversation: "Opa" },
      },
    });
    expect(result).toEqual({
      kind: "messages",
      items: [
        {
          waMessageId: "LIDONLY",
          fromPhone: "+999035656245495",
          waLid: "+999035656245495",
          body: "Opa",
        },
      ],
    });
  });

  it("does not use webhook sender (número do escritório) as the inbound phone", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      sender: "553898100827@s.whatsapp.net",
      data: {
        key: { id: "LID2", remoteJid: "43035656245495@lid", fromMe: false },
        message: { conversation: "Blz" },
      },
    });
    expect(result.kind).toBe("messages");
    if (result.kind === "messages") {
      expect(result.items[0]?.fromPhone).toBe(phoneFromWhatsAppLid("43035656245495@lid"));
      expect(result.items[0]?.fromPhone).not.toBe("+553898100827");
    }
  });

  it("uses remoteJidAlt when remoteJid is @lid", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: {
          id: "LID1",
          remoteJid: "123456789012345@lid",
          remoteJidAlt: "5511977770000@s.whatsapp.net",
          fromMe: false,
        },
        message: { conversation: "lid" },
      },
    });
    expect(result).toEqual({
      kind: "messages",
      items: [
        {
          waMessageId: "LID1",
          fromPhone: "+5511977770000",
          waLid: "+999456789012345",
          body: "lid",
        },
      ],
    });
  });
});

describe("extractMessageText", () => {
  it("prefers caption on image when conversation is absent", () => {
    expect(extractMessageText({ imageMessage: { caption: "foto" } })).toBe("foto");
  });
});
