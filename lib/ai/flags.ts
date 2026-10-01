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

/** Autoenvio WhatsApp. Ausente ou qualquer valor diferente de "true" = desligado. */
export function isAiWhatsappSendEnabled(): boolean {
  return process.env.AI_WHATSAPP_SEND_ENABLED === "true";
}

/** Promoção de triagem pelo worker. Ausente ou qualquer valor diferente de "true" = desligado. */
export function isAiCreateTicketEnabled(): boolean {
  return process.env.AI_CREATE_TICKET_ENABLED === "true";
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
