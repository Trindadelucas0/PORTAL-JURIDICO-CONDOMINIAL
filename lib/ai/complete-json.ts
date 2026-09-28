import { ZodError } from "zod";
import type { AiProvider } from "@/lib/ai/provider";
import { modelOutputSchema, type ModelOutput } from "@/lib/ai/output";

export function parseModelJson(text: string): ModelOutput {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  return modelOutputSchema.parse(JSON.parse(cleaned));
}

export function isInvalidModelJson(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof ZodError || (error instanceof Error && error.name === "ZodError");
}

export async function completeValidJson(
  provider: AiProvider,
  input: { system: string; user: string; model: string; maxTokens: number; timeoutMs: number },
): Promise<{ ok: true; parsed: ModelOutput; completion: Awaited<ReturnType<AiProvider["complete"]>>; raw: string } | { ok: false }> {
  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await provider.complete(input);
    lastRaw = completion.text;
    try {
      const parsed = parseModelJson(completion.text);
      return { ok: true, parsed, completion, raw: completion.text };
    } catch (error) {
      if (!isInvalidModelJson(error) || attempt === 1) {
        if (isInvalidModelJson(error) && attempt === 1) return { ok: false };
        throw error;
      }
    }
  }
  void lastRaw;
  return { ok: false };
}
