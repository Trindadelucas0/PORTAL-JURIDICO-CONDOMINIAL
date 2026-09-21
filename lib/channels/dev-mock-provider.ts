import type {
  ProviderSendInput,
  ProviderSendMediaInput,
  ProviderStatusResult,
  QrResult,
  WhatsAppProvider,
} from "@/lib/channels/whatsapp-provider";

export class DevMockProvider implements WhatsAppProvider {
  kind = "dev_mock" as const;

  label() {
    return "Dev / mock (somente desenvolvimento)";
  }

  isConfigured() {
    return true;
  }

  async send(input: ProviderSendInput): Promise<{ waMessageId: string | null; rawStatus: string }> {
    return {
      waMessageId: `mock-${Date.now()}-${input.toE164.slice(-4)}`,
      rawStatus: "mock_sent",
    };
  }

  async sendMedia(input: ProviderSendMediaInput) {
    return {
      waMessageId: `mock-media-${Date.now()}-${input.toE164.slice(-4)}`,
      rawStatus: "mock_sent",
    };
  }

  async getQr(_opts?: { fresh?: boolean }): Promise<QrResult> {
    return { qr: null, pairingCode: null, status: "not_applicable" };
  }

  async getStatus(): Promise<ProviderStatusResult> {
    return { status: "open", detail: "Canal DEV sempre disponível" };
  }

  async ensureInstance(): Promise<void> {
    // Mock não cria instância externa.
  }

  async disconnect(): Promise<ProviderStatusResult> {
    return { status: "open", detail: "DevMock não desconecta" };
  }
}
