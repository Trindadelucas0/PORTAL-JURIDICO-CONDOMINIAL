export const AI_ALLOWED_ACTIONS = ["CREATE_DRAFT", "WRITE_TICKET_MEMORY"] as const;

export type AiAllowedAction = (typeof AI_ALLOWED_ACTIONS)[number];

const ALLOWED = new Set<string>(AI_ALLOWED_ACTIONS);

export type GateResult = { allowed: true; action: AiAllowedAction } | { allowed: false; action: string; code: "ACTION_BLOCKED" };

/** O modelo não escolhe a ação no banco. Só estas duas passam. */
export function evaluateAction(action: string): GateResult {
  if (ALLOWED.has(action)) {
    return { allowed: true, action: action as AiAllowedAction };
  }
  return { allowed: false, action, code: "ACTION_BLOCKED" };
}
