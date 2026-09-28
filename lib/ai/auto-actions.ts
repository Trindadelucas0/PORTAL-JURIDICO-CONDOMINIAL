import type { ServerFallback } from "@/lib/ai/decide-turn";
import { isAiCreateTicketEnabled, isAiWhatsappSendEnabled } from "@/lib/ai/flags";

export function shouldDispatchAiDraft(input: {
  sendEnabled?: boolean;
  injection: boolean;
  serverFallback: ServerFallback | null | undefined;
}): boolean {
  const sendEnabled = input.sendEnabled ?? isAiWhatsappSendEnabled();
  return sendEnabled && !input.injection && !input.serverFallback;
}

export function shouldPromoteTriageAsSystem(input: {
  createEnabled?: boolean;
  openTicketCount: number;
  condominiumId: string | null;
  triageId: string | null;
  triagePromoted: boolean;
}): boolean {
  const createEnabled = input.createEnabled ?? isAiCreateTicketEnabled();
  return (
    createEnabled &&
    input.openTicketCount === 0 &&
    Boolean(input.condominiumId) &&
    Boolean(input.triageId) &&
    !input.triagePromoted
  );
}
