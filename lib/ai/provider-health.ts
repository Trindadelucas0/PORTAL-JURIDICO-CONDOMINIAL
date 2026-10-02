import { resolveAiBaseUrl, resolveBackupEndpoint, withTimeout } from "@/lib/ai/provider";

export type EndpointHealth = { status: "ok" } | { status: "fail"; code: string } | { status: "absent" };

const PROBE_TIMEOUT_MS = 4000;

function probeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  if (error instanceof Error && error.message === "timeout") return "TIMEOUT";
  return "ERROR";
}

async function pingChat(base: string, apiKey: string, model: string): Promise<EndpointHealth> {
  try {
    const response = await withTimeout(
      fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      }),
      PROBE_TIMEOUT_MS,
    );
    if (response.ok) return { status: "ok" };
    return { status: "fail", code: `HTTP_${response.status}` };
  } catch (error) {
    return { status: "fail", code: probeErrorCode(error) };
  }
}

export async function probeAiProviders(): Promise<{ primary: EndpointHealth; backup: EndpointHealth }> {
  const base = resolveAiBaseUrl();
  const apiKey = process.env.AI_API_KEY?.trim();
  const primaryModel = process.env.AI_MODEL_MAIN?.trim() || "main";
  const backup = resolveBackupEndpoint();

  const [primary, backupHealth] = await Promise.all([
    base && apiKey ? pingChat(base, apiKey, primaryModel) : Promise.resolve({ status: "absent" } as EndpointHealth),
    backup ? pingChat(backup.base, backup.apiKey, backup.model) : Promise.resolve({ status: "absent" } as EndpointHealth),
  ]);
  return { primary, backup: backupHealth };
}
