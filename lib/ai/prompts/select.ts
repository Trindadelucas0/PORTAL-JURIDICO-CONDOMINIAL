import { INBOUND_V1_SYSTEM } from "@/lib/ai/prompts/inbound-v1";
import { INBOUND_V2_SYSTEM } from "@/lib/ai/prompts/inbound-v2";
import { INBOUND_V3_SYSTEM } from "@/lib/ai/prompts/inbound-v3";
import { aiPromptVersion } from "@/lib/ai/flags";

/** Valor desconhecido cai no v2, para um erro de digitação não ligar o prompt mais novo. */
export function systemPromptFor(version = aiPromptVersion()): string {
  if (version === "inbound-v1") return INBOUND_V1_SYSTEM;
  if (version === "inbound-v3") return INBOUND_V3_SYSTEM;
  return INBOUND_V2_SYSTEM;
}
