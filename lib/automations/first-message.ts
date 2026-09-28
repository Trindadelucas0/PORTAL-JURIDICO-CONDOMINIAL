export type FirstMessageDecision =
  | { action: "ignore" }
  | { action: "skip"; reason: "outside_hours" | "active_ticket" }
  | { action: "send" };

export function decideFirstMessage(input: {
  direction: "in" | "out";
  contactId: string | null;
  ruleActive: boolean;
  earlierInboundExists: boolean;
  claim: "won" | "lost" | "not_attempted";
  withinWindow: boolean;
  skipActiveTicket: boolean;
  hasActiveTicket: boolean;
}): FirstMessageDecision {
  if (input.direction !== "in") return { action: "ignore" };
  if (!input.contactId) return { action: "ignore" };
  if (!input.ruleActive) return { action: "ignore" };
  if (input.earlierInboundExists) return { action: "ignore" };
  if (input.claim !== "won") return { action: "ignore" };
  if (!input.withinWindow) return { action: "skip", reason: "outside_hours" };
  if (input.skipActiveTicket && input.hasActiveTicket) return { action: "skip", reason: "active_ticket" };
  return { action: "send" };
}
