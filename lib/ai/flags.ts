/** Kill switch. Ausente ou qualquer valor diferente de "true" = desligado. */
export function isAiEnabled(): boolean {
  return process.env.AI_ENABLED === "true";
}

export function isAiRagEnabled(): boolean {
  return process.env.AI_RAG_ENABLED === "true";
}

export function isAiMemoryEnabled(): boolean {
  return process.env.AI_MEMORY_ENABLED === "true";
}

export function isAiAutoDraftEnabled(): boolean {
  return process.env.AI_AUTO_DRAFT_ENABLED === "true";
}

/** Autoenvio WhatsApp. Sempre desligado (contrato v14); a env não liga. */
export function isAiWhatsappSendEnabled(): boolean {
  return false;
}

/** Promoção de triagem pelo worker. Sempre desligado (contrato v14); a env não liga. */
export function isAiCreateTicketEnabled(): boolean {
  return false;
}

export function aiPromptVersion(): string {
  const value = process.env.AI_PROMPT_VERSION?.trim();
  return value || "inbound-v3";
}

export function aiPublicFlags() {
  return {
    aiEnabled: isAiEnabled(),
    rag: isAiRagEnabled(),
    memory: isAiMemoryEnabled(),
    autoDraft: isAiAutoDraftEnabled(),
    whatsappSend: isAiWhatsappSendEnabled(),
    createTicket: isAiCreateTicketEnabled(),
  };
}
