import { INBOUND_V1_SYSTEM } from "@/lib/ai/prompts/inbound-v1";
import { INBOUND_V2_SYSTEM } from "@/lib/ai/prompts/inbound-v2";
import { aiPromptVersion } from "@/lib/ai/flags";

export function systemPromptFor(version = aiPromptVersion()): string {
  if (version === "inbound-v1") return INBOUND_V1_SYSTEM;
  return INBOUND_V2_SYSTEM;
}
