import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { AppError, failClosed, notFound, unprocessable } from "@/lib/api/errors";
import { atendimentoService } from "@/lib/services/atendimento-service";
import { providerFor } from "@/lib/channels/resolve-provider";
import { rememberEvolutionQr } from "@/lib/channels/evolution-qr-cache";
import { interpretEvolutionWebhook } from "@/lib/channels/evolution-webhook";

const connectionCreate = z.object({
  type: z.enum(["evolution_baileys", "evolution_cloud", "dev_mock"]),
  label: z.string().min(2).max(80),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
});

type ChannelStatus = "close" | "connecting" | "open";

function mapLiveToDbStatus(live: string): ChannelStatus | null {
  const s = live.toLowerCase();
  if (s === "open" || s === "connected") return "open";
  if (s === "connecting" || s === "qr" || s === "qrcode") return "connecting";
  if (s === "close" || s === "closed" || s === "disconnected" || s === "logout") return "close";
  return null;
}

function publicConnection<T extends { metadataJson: unknown }>(row: T) {
  return {
    ...row,
    secretStatus: "cadastrado" as const,
  };
}

async function syncConnectionStatus(id: string, liveStatus: string) {
  const mapped = mapLiveToDbStatus(liveStatus);
  if (!mapped) return null;
  return prisma.channelConnection.update({
    where: { id },
    data: { status: mapped },
  });
}

export const whatsappService = {
  async list() {
    const items = await prisma.channelConnection.findMany({ orderBy: { createdAt: "asc" } });
    const enriched = [];
    for (const row of items) {
      const base = publicConnection(row);
      if (row.type !== "evolution_baileys") {
        const provider = providerFor(row.type);
        enriched.push({
          ...base,
          configured: provider.isConfigured(),
          liveStatus: row.status,
          detail: provider.label(),
        });
        continue;
      }

      const provider = providerFor(row.type);
      const configured = provider.isConfigured();
      if (!configured) {
        enriched.push({
          ...base,
          configured: false,
          liveStatus: "close",
          detail: "Evolution Baileys não configurada (URL/APIKEY ausentes)",
        });
        continue;
      }

      try {
        const live = await provider.getStatus();
        const synced = await syncConnectionStatus(row.id, live.status);
        enriched.push({
          ...publicConnection(synced ?? row),
          configured: true,
          liveStatus: live.status,
          detail: live.detail,
        });
      } catch {
        enriched.push({
          ...base,
          configured: true,
          liveStatus: row.status,
          detail: "status_unavailable",
        });
      }
    }
    return enriched;
  },

  async create(input: unknown) {
    const data = connectionCreate.parse(input);
    const row = await prisma.channelConnection.create({
      data: {
        type: data.type,
        label: data.label,
        metadataJson: (data.metadataJson ?? {}) as Prisma.InputJsonValue,
        status: data.type === "dev_mock" ? "open" : "close",
      },
    });
    const provider = providerFor(row.type);
    return {
      ...publicConnection(row),
      configured: provider.isConfigured(),
      liveStatus: row.status,
      detail: provider.label(),
    };
  },

  async patch(id: string, input: unknown) {
    const existing = await prisma.channelConnection.findFirst({ where: { id } });
    if (!existing) throw notFound("Conexão não encontrada");
    const body = z
      .object({
        label: z.string().min(2).max(80).optional(),
        status: z.enum(["close", "connecting", "open"]).optional(),
      })
      .parse(input);
    const row = await prisma.channelConnection.update({
      where: { id },
      data: body,
    });
    const provider = providerFor(row.type);
    return {
      ...publicConnection(row),
      configured: provider.isConfigured(),
      liveStatus: row.status,
      detail: provider.label(),
    };
  },

  async status(id: string) {
    const row = await prisma.channelConnection.findFirst({ where: { id } });
    if (!row) throw notFound("Conexão não encontrada");
    const provider = providerFor(row.type);
    const configured = provider.isConfigured();
    if (row.type === "evolution_baileys" && !configured) {
      return {
        id: row.id,
        type: row.type,
        configured: false,
        status: "close" as const,
        liveStatus: "close",
        detail: "Evolution Baileys não configurada (URL/APIKEY ausentes)",
      };
    }
    const live = await provider.getStatus();
    const synced = row.type === "evolution_baileys" ? await syncConnectionStatus(row.id, live.status) : null;
    return {
      id: row.id,
      type: row.type,
      configured,
      status: (synced?.status ?? row.status) as string,
      liveStatus: live.status,
      detail: live.detail,
    };
  },

  async qr(id: string, opts?: { fresh?: boolean }) {
    const row = await prisma.channelConnection.findFirst({ where: { id } });
    if (!row) throw notFound("Conexão não encontrada");
    if (row.type !== "evolution_baileys") {
      throw new AppError(409, "QR_NOT_APPLICABLE", "QR disponível apenas para WhatsApp Web (Baileys)");
    }
    const provider = providerFor(row.type);
    if (!provider.isConfigured()) {
      throw unprocessable("Evolution Baileys não configurada (URL/APIKEY ausentes)");
    }
    // Fresh poll skips ensure (instance already exists while pairing); first connect still ensures.
    if (!opts?.fresh) {
      await provider.ensureInstance();
    }
    const qr = await provider.getQr(opts);
    if (qr.qr || qr.pairingCode) {
      await syncConnectionStatus(row.id, "connecting");
    }
    return qr;
  },

  async disconnect(id: string) {
    const row = await prisma.channelConnection.findFirst({ where: { id } });
    if (!row) throw notFound("Conexão não encontrada");
    if (row.type !== "evolution_baileys") {
      throw new AppError(409, "DISCONNECT_NOT_APPLICABLE", "Desconectar disponível apenas para WhatsApp Web (Baileys)");
    }
    const provider = providerFor(row.type);
    if (!provider.isConfigured()) {
      throw unprocessable("Evolution Baileys não configurada (URL/APIKEY ausentes)");
    }
    const live = await provider.disconnect();
    const synced = await syncConnectionStatus(row.id, live.status);
    return {
      id: row.id,
      type: row.type,
      configured: true,
      status: (synced?.status ?? "close") as string,
      liveStatus: live.status,
      detail: live.detail,
    };
  },

  assertWebhookSecret(headerSecret: string | null) {
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (!expected) {
      throw failClosed("Webhook Evolution recusado: secret não cadastrado");
    }
    if (!headerSecret) {
      throw failClosed("Webhook Evolution recusado");
    }
    const provided = createHash("sha256").update(headerSecret).digest();
    const wanted = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(provided, wanted)) {
      throw failClosed("Webhook Evolution recusado");
    }
  },

  async ingestEvolution(body: unknown) {
    const parsed = interpretEvolutionWebhook(body);
    if (parsed.kind === "malformed") {
      return { ignored: true as const, reason: "malformed" };
    }
    if (parsed.kind === "qrcode") {
      rememberEvolutionQr({ qr: parsed.qr, pairingCode: parsed.pairingCode });
      return { ignored: true as const, reason: "qrcode" };
    }
    if (parsed.kind === "ignored") {
      return { ignored: true as const, reason: parsed.reason };
    }

    const ingested = [];
    for (const item of parsed.items) {
      if (item.fromMe) {
        ingested.push(
          await atendimentoService.ingestOwnOutbound({
            waMessageId: item.waMessageId,
            fromPhone: item.fromPhone,
            waLid: item.waLid,
            body: item.body,
            sentAt: item.sentAt,
            connectionType: "evolution_baileys",
          }),
        );
        continue;
      }
      ingested.push(
        await atendimentoService.ingestInbound({
          waMessageId: item.waMessageId,
          fromPhone: item.fromPhone,
          waLid: item.waLid,
          body: item.body,
          peerDisplayName: item.pushName,
          connectionType: "evolution_baileys",
        }),
      );
    }
    return ingested.length === 1 ? ingested[0] : { items: ingested };
  },
};
