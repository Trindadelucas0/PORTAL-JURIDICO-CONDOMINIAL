export type ConnectionKind = "evolution_baileys" | "evolution_cloud" | "dev_mock";

export type ProviderSendInput = {
  toE164: string;
  body: string;
  quotedWaMessageId?: string;
};

export type ProviderSendMediaInput = {
  toE164: string;
  body?: string;
  mime: string;
  fileName: string;
  buffer: Buffer;
  quotedWaMessageId?: string;
  ptt?: boolean;
};

export type ProviderSendResult = {
  waMessageId: string | null;
  rawStatus: string;
};

export type QrResult = {
  qr: string | null;
  pairingCode: string | null;
  status: string;
};

export type ProviderStatusResult = {
  status: string;
  detail: string;
};

export interface WhatsAppProvider {
  kind: ConnectionKind;
  label(): string;
  isConfigured(): boolean;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
  sendMedia(input: ProviderSendMediaInput): Promise<ProviderSendResult>;
  getQr(): Promise<QrResult>;
  getStatus(): Promise<ProviderStatusResult>;
  /** Garante instância Baileys na Evolution (no-op nos demais providers). */
  ensureInstance(): Promise<void>;
  /** Desconecta sessão WhatsApp (logout). */
  disconnect(): Promise<ProviderStatusResult>;
}
