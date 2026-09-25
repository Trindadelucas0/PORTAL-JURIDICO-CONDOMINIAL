import { describe, expect, it } from "vitest";
import {
  extractMessageText,
  interpretEvolutionWebhook,
  maybeDumpEvolutionWebhookBody,
  phoneFromWhatsAppLid,
  parseWhatsAppSentAt,
  redactWebhookDumpSecrets,
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
      items: [
        {
          waMessageId: "ABC",
          fromPhone: "+5511988880000",
          waLid: null,
          body: "Olá",
          fromMe: false,
          sentAt: null,
        },
      ],
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
      expect(result.items[0]?.fromMe).toBe(false);
    }
  });

  it("accepts fromMe as office outbound with placeholder body when text is null", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: { id: "X", remoteJid: "5511988880000@s.whatsapp.net", fromMe: 1 },
        messageTimestamp: 1700000000,
        message: { conversation: null, extendedTextMessage: { text: null } },
      },
    });
    expect(result).toEqual({
      kind: "messages",
      items: [
        {
          waMessageId: "X",
          fromPhone: "+5511988880000",
          waLid: null,
          body: "(mídia ou mensagem sem texto)",
          fromMe: true,
          sentAt: new Date(1700000000 * 1000).toISOString(),
        },
      ],
    });
  });

  it("keeps inbound and fromMe in the same batch", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: [
        {
          key: { id: "IN1", remoteJid: "5511988880000@s.whatsapp.net", fromMe: false },
          message: { conversation: "oi" },
        },
        {
          key: { id: "OUT1", remoteJid: "5511988880000@s.whatsapp.net", fromMe: true },
          message: { conversation: "resposta" },
        },
      ],
    });
    expect(result.kind).toBe("messages");
    if (result.kind === "messages") {
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.fromMe).toBe(false);
      expect(result.items[1]?.fromMe).toBe(true);
      expect(result.items[1]?.body).toBe("resposta");
    }
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
          fromMe: false,
          sentAt: null,
        },
      ],
    });
  });

  it("keeps WhatsApp pushName when present", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: { id: "PN", remoteJid: "43035656245495@lid", fromMe: false },
        pushName: "Ezequiel",
        message: { conversation: "Oi" },
      },
    });
    expect(result.kind).toBe("messages");
    if (result.kind === "messages") {
      expect(result.items[0]?.pushName).toBe("Ezequiel");
    }
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
          fromMe: false,
          sentAt: null,
        },
      ],
    });
  });

  it("extracts only @lid when remoteJid is @lid and no remoteJidAlt available", () => {
    /**
     * Cenário: mensagem chega com @lid puro (sem remoteJidAlt).
     * Sistema cria conversa com LID placeholder.
     * Ingest depois resolve via Evolution findMessages (que terá remoteJidAlt).
     */
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: {
          id: "LIDONLY1",
          remoteJid: "142112045666497@lid",
          fromMe: false,
        },
        message: { conversation: "olá sem número" },
      },
    });
    expect(result).toEqual({
      kind: "messages",
      items: [
        {
          waMessageId: "LIDONLY1",
          fromPhone: "+999112045666497",
          waLid: "+999112045666497",
          body: "olá sem número",
          fromMe: false,
          sentAt: null,
        },
      ],
    });
  });

  it("keeps LID from previousRemoteJid when Evolution already swapped remoteJid to the phone", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: {
          id: "SWAP1",
          remoteJid: "551196522318@s.whatsapp.net",
          previousRemoteJid: "142112045666497@lid",
          fromMe: false,
        },
        message: { conversation: "oi" },
      },
    });
    expect(result).toEqual({
      kind: "messages",
      items: [
        {
          waMessageId: "SWAP1",
          fromPhone: "+551196522318",
          waLid: phoneFromWhatsAppLid("142112045666497@lid"),
          body: "oi",
          fromMe: false,
          sentAt: null,
        },
      ],
    });
  });

  it("reads snake_case sender_pn", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: { id: "SN1", remoteJid: "112045666497@lid", fromMe: false },
        sender_pn: "5511996522318@s.whatsapp.net",
        message: { conversation: "snake" },
      },
    });
    expect(result.kind).toBe("messages");
    if (result.kind === "messages") {
      expect(result.items[0]?.fromPhone).toBe("+5511996522318");
      expect(result.items[0]?.waLid).toBe(phoneFromWhatsAppLid("112045666497@lid"));
    }
  });

  it("prefers senderPn digits over LID placeholder", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      sender: "553898100827@s.whatsapp.net",
      data: {
        key: {
          id: "PN1",
          remoteJid: "130885504524400@lid",
          senderPn: "5511988880000",
          fromMe: false,
        },
        message: { conversation: "oi" },
      },
    });
    expect(result).toEqual({
      kind: "messages",
      items: [
        {
          waMessageId: "PN1",
          fromPhone: "+5511988880000",
          waLid: "+999885504524400",
          body: "oi",
          fromMe: false,
          sentAt: null,
        },
      ],
    });
  });

  it("strips WhatsApp device suffix from the phone JID", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      data: {
        key: { id: "DEV1", remoteJid: "5511988880000:51@s.whatsapp.net", fromMe: false },
        message: { conversation: "device" },
      },
    });
    expect(result.kind).toBe("messages");
    if (result.kind === "messages") {
      expect(result.items[0]?.fromPhone).toBe("+5511988880000");
    }
  });

  it("does not treat data.jid (often the office) as the inbound phone", () => {
    const result = interpretEvolutionWebhook({
      event: "messages.upsert",
      sender: "553898100827@s.whatsapp.net",
      data: {
        key: { id: "JID1", remoteJid: "130885504524400@lid", fromMe: false },
        jid: "553898100827@s.whatsapp.net",
        message: { conversation: "nao e o escritorio" },
      },
    });
    expect(result.kind).toBe("messages");
    if (result.kind === "messages") {
      expect(result.items[0]?.fromPhone).toBe(phoneFromWhatsAppLid("130885504524400@lid"));
      expect(result.items[0]?.fromPhone).not.toBe("+553898100827");
    }
  });
});

describe("extractMessageText", () => {
  it("prefers caption on image when conversation is absent", () => {
    expect(extractMessageText({ imageMessage: { caption: "foto" } })).toBe("foto");
  });
});

describe("parseWhatsAppSentAt", () => {
  it("accepts unix seconds in a plausible window", () => {
    expect(parseWhatsAppSentAt(1700000000)).toBe(new Date(1700000000 * 1000).toISOString());
    expect(parseWhatsAppSentAt(1)).toBeNull();
    expect(parseWhatsAppSentAt("not-a-date")).toBeNull();
  });
});

describe("webhook dump", () => {
  it("redacts apikey and token without touching remoteJid or pushName", () => {
    const dumped = redactWebhookDumpSecrets({
      event: "messages.upsert",
      apikey: "secret-key",
      apiKey: "also-secret",
      data: {
        key: { id: "ABC123", remoteJid: "130885504524400@lid", remoteJidAlt: "5511988880000@s.whatsapp.net" },
        pushName: "Maria",
        token: "nope",
        authorization: "Bearer x",
      },
    }) as Record<string, unknown>;
    expect(dumped.apikey).toBe("[redacted]");
    expect(dumped.apiKey).toBe("[redacted]");
    const data = dumped.data as Record<string, unknown>;
    expect(data.token).toBe("[redacted]");
    expect(data.authorization).toBe("[redacted]");
    const key = data.key as Record<string, unknown>;
    expect(key.remoteJid).toBe("130885504524400@lid");
    expect(key.remoteJidAlt).toBe("5511988880000@s.whatsapp.net");
    expect(key.id).toBe("ABC123");
    expect(data.pushName).toBe("Maria");
  });

  it("does not dump when EVOLUTION_WEBHOOK_DUMP is not 1", () => {
    const prev = process.env.EVOLUTION_WEBHOOK_DUMP;
    delete process.env.EVOLUTION_WEBHOOK_DUMP;
    expect(maybeDumpEvolutionWebhookBody({ event: "messages.upsert" })).toBe(false);
    if (prev) process.env.EVOLUTION_WEBHOOK_DUMP = prev;
  });
});
