import { unprocessable } from "@/lib/api/errors";
import type {
  ProviderSendInput,
  ProviderSendMediaInput,
  ProviderStatusResult,
  QrResult,
  WhatsAppProvider,
} from "@/lib/channels/whatsapp-provider";

export class EvolutionCloudProvider implements WhatsAppProvider {
  kind = "evolution_cloud" as const;

  label() {
    return "WhatsApp Cloud (oficial) — não configurado nesta fase";
  }

  isConfigured() {
    return false;
  }

  async send(input: ProviderSendInput): Promise<{ waMessageId: string | null; rawStatus: string }> {
    void input;
    throw unprocessable("WhatsApp Cloud não está configurado. Não use Baileys como canal oficial.");
  }

  async sendMedia(input: ProviderSendMediaInput): Promise<{ waMessageId: string | null; rawStatus: string }> {
    void input;
    throw unprocessable("WhatsApp Cloud não está configurado. Não use Baileys como canal oficial.");
  }

  async getQr(_opts?: { fresh?: boolean }): Promise<QrResult> {
    return { qr: null, pairingCode: null, status: "not_configured" };
  }

  async getStatus(): Promise<ProviderStatusResult> {
    return { status: "close", detail: "não configurado" };
  }

  async ensureInstance(): Promise<void> {
    // Cloud não usa instância Baileys.
  }

  async disconnect(): Promise<ProviderStatusResult> {
    throw unprocessable("WhatsApp Cloud não está configurado");
  }
}
