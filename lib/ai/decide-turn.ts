import { evaluateAction } from "@/lib/ai/action-gate";
import type { SummaryJson } from "@/lib/ai/output";
import { versionMatches } from "@/lib/ai/memory";

export type ServerFallback = "injection" | "human_review";

export type TurnInput = {
  autoDraft: boolean;
  memoryEnabled: boolean;
  abstain: boolean;
  injection: boolean;
  serverFallback?: ServerFallback | null;
  requestedActions: string[];
  interactionExists: boolean;
  currentVersion: number;
  expectedVersion: number;
  draftText: string | null;
  summary: SummaryJson;
  /** Job com bolhas marcadas: grava rascunho mesmo com abstain (confiança baixa). */
  allowAbstainDraft?: boolean;
};

export type TurnDecision = {
  draftBody: string | null;
  writeMemory: boolean;
  memoryVersion: number | null;
  blockedActions: string[];
};

export function decideTurn(input: TurnInput): TurnDecision {
  const blockedActions: string[] = [];
  let allowDraft = false;
  let allowMemory = false;
  for (const action of input.requestedActions) {
    const gate = evaluateAction(action);
    if (!gate.allowed) {
      blockedActions.push(action);
      continue;
    }
    if (gate.action === "CREATE_DRAFT") allowDraft = true;
    if (gate.action === "WRITE_TICKET_MEMORY") allowMemory = true;
  }

  const serverDraft = input.serverFallback === "injection";
  const draftBody =
    input.serverFallback === "human_review"
      ? null
      : allowDraft &&
          input.autoDraft &&
          !input.interactionExists &&
          input.draftText &&
          (serverDraft || !input.abstain || Boolean(input.allowAbstainDraft))
        ? input.draftText.slice(0, 8000)
        : null;

  const writeMemory =
    allowMemory &&
    input.memoryEnabled &&
    versionMatches(input.currentVersion, input.expectedVersion);

  return {
    draftBody,
    writeMemory,
    memoryVersion: writeMemory ? input.currentVersion + 1 : null,
    blockedActions,
  };
}
