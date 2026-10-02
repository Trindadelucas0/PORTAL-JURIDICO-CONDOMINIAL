export type CompleteInput = {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
};

export type CompleteResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export type EmbedInput = {
  texts: string[];
  model: string;
  timeoutMs: number;
  /** NVIDIA: passage no índice, query na busca. Outros provedores ignoram. */
  inputType?: "query" | "passage";
};

export interface AiProvider {
  complete(input: CompleteInput): Promise<CompleteResult>;
  embed(input: EmbedInput): Promise<number[][]>;
}

export class AiTimeoutError extends Error {
  code = "TIMEOUT";
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiTimeoutError("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createFakeAiProvider(handler: (input: CompleteInput) => CompleteResult | Promise<CompleteResult>): AiProvider {
  return {
    async complete(input) {
      return withTimeout(Promise.resolve(handler(input)), input.timeoutMs);
    },
    async embed(input) {
      return withTimeout(
        Promise.resolve(input.texts.map(() => Array.from({ length: 1536 }, () => 0))),
        input.timeoutMs,
      );
    },
  };
}

const BLOCKED_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|metadata\.google\.internal)$/i;
const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/;

export function assertPublicAiBase(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("AI_BASE_BLOCKED");
  }
  if (BLOCKED_HOST.test(url.hostname) || PRIVATE_IP.test(url.hostname)) {
    throw new Error("AI_BASE_BLOCKED");
  }
  return url;
}

export function resolveAiBaseUrl(): string | null {
  const provider = process.env.AI_PROVIDER?.trim();
  if (!provider || !process.env.AI_API_KEY?.trim()) return null;
  if (provider === "openai") return "https://api.openai.com/v1";
  const base = process.env.AI_API_BASE_URL?.trim();
  if (!base) return null;
  try {
    return assertPublicAiBase(base).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_BACKUP_MODEL = "gemini-2.5-flash";

type BackupEndpoint = { base: string; apiKey: string; model: string };

export function resolveBackupEndpoint(env: NodeJS.ProcessEnv = process.env): BackupEndpoint | null {
  const apiKey = env.AI_API_KEY_BACKUP?.trim();
  if (!apiKey) return null;
  const raw = env.AI_API_BASE_URL_BACKUP?.trim() || GEMINI_OPENAI_BASE;
  try {
    const base = assertPublicAiBase(raw).toString().replace(/\/$/, "");
    const model = env.AI_MODEL_BACKUP?.trim() || GEMINI_BACKUP_MODEL;
    return { base, apiKey, model };
  } catch {
    return null;
  }
}

function providerErrorCode(error: unknown): string {
  if (error instanceof AiTimeoutError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  if (error instanceof TypeError) return "NETWORK";
  return "";
}

function isProviderFailure(error: unknown): boolean {
  const code = providerErrorCode(error);
  return code === "TIMEOUT" || code === "NETWORK" || code.startsWith("HTTP_");
}

export function createHttpAiProvider(): AiProvider | null {
  const base = resolveAiBaseUrl();
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!base || !apiKey) return null;
  return {
    async complete(input) {
      try {
        return await withTimeout(postChat(base, apiKey, input), input.timeoutMs);
      } catch (error) {
        const backup = resolveBackupEndpoint();
        if (!backup || !isProviderFailure(error)) throw error;
        console.error(`[ai] failover code=${providerErrorCode(error)}`);
        try {
          return await withTimeout(
            postChat(backup.base, backup.apiKey, { ...input, model: backup.model }),
            input.timeoutMs,
          );
        } catch (backupError) {
          if (providerErrorCode(backupError) === "HTTP_401") {
            console.error("[ai] backup key rejected");
          }
          throw backupError;
        }
      }
    },
    async embed(input) {
      return withTimeout(postEmbed(base, apiKey, input), input.timeoutMs);
    },
  };
}

export function createAiProviderFromEnv(): AiProvider | null {
  return createHttpAiProvider();
}

function gemini25ReasoningOff(base: string, model: string): boolean {
  try {
    return new URL(base).hostname === "generativelanguage.googleapis.com" && model.startsWith("gemini-2.5");
  } catch {
    return false;
  }
}

function httpErrorDetail(raw: string, apiKey: string): string {
  let message = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error && typeof parsed.error === "object" && typeof parsed.error.message === "string") message = parsed.error.message;
    else if (typeof parsed.message === "string") message = parsed.message;
  } catch {
    message = raw;
  }
  return message
    .split(apiKey).join("")
    .replace(/Bearer\s+\S+/gi, "")
    .replace(/nvapi-\S+/gi, "")
    .replace(/AIza\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

async function postChat(base: string, apiKey: string, input: CompleteInput): Promise<CompleteResult> {
  const body: Record<string, unknown> = {
    model: input.model,
    temperature: 0,
    max_tokens: input.maxTokens,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };
  if (gemini25ReasoningOff(base, input.model)) body.reasoning_effort = "none";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = httpErrorDetail(await response.text(), apiKey);
    console.error(`[ai] http status=${response.status} detail=${detail}`);
    throw Object.assign(new Error("AI_HTTP"), { code: `HTTP_${response.status}` });
  }
  const json = (await response.json()) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  };
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    model: json.model || input.model,
  };
}

async function postEmbed(base: string, apiKey: string, input: EmbedInput): Promise<number[][]> {
  const nvidia = base.includes("nvidia.com") || input.model.startsWith("nvidia/");
  const body: Record<string, unknown> = {
    model: input.model,
    input: input.texts,
  };
  if (nvidia) {
    body.dimensions = 1536;
    body.input_type = input.inputType ?? "passage";
    body.encoding_format = "float";
    body.truncate = "END";
  }
  const response = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw Object.assign(new Error("AI_HTTP"), { code: `HTTP_${response.status}` });
  }
  const json = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  return (json.data ?? []).map((row) => row.embedding ?? []);
}
