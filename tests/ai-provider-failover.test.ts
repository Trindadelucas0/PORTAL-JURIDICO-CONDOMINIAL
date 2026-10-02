import { afterEach, describe, expect, it, vi } from "vitest";
import { packageContainsSecret } from "@/lib/ai/package";
import { createHttpAiProvider } from "@/lib/ai/provider";

const NVIDIA = "https://integrate.api.nvidia.com/v1";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai";

const completeInput = {
  system: "sistema",
  user: "pergunta",
  model: "meta/llama-3.1-70b-instruct",
  maxTokens: 20,
  timeoutMs: 5000,
};

const envKeys = [
  "AI_PROVIDER",
  "AI_API_KEY",
  "AI_API_BASE_URL",
  "AI_API_KEY_BACKUP",
  "AI_API_BASE_URL_BACKUP",
  "AI_MODEL_BACKUP",
] as const;

const previous: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

function rememberEnv() {
  for (const key of envKeys) previous[key] = process.env[key];
}

function restoreEnv() {
  for (const key of envKeys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

function chatOk(model: string, text: string) {
  return new Response(
    JSON.stringify({
      model,
      usage: { prompt_tokens: 3, completion_tokens: 4 },
      choices: [{ message: { content: text } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function bodyOf(call: unknown[]) {
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as { model: string; reasoning_effort?: string };
}

describe("AI provider failover", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("retries chat on Gemini when NVIDIA returns HTTP 429", async () => {
    rememberEnv();
    process.env.AI_PROVIDER = "nvidia";
    process.env.AI_API_KEY = "nvapi-test-primary";
    process.env.AI_API_BASE_URL = NVIDIA;
    process.env.AI_API_KEY_BACKUP = "backup-test-key-not-real";
    process.env.AI_API_BASE_URL_BACKUP = GEMINI;
    process.env.AI_MODEL_BACKUP = "gemini-2.5-flash";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("quota", { status: 429 }))
      .mockResolvedValueOnce(chatOk("gemini-2.5-flash", "{\"ok\":true}"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createHttpAiProvider();
    const result = await provider!.complete(completeInput);

    expect(result.text).toBe("{\"ok\":true}");
    expect(result.model).toBe("gemini-2.5-flash");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${NVIDIA}/chat/completions`);
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe("meta/llama-3.1-70b-instruct");
    expect(bodyOf(fetchMock.mock.calls[0]).reasoning_effort).toBeUndefined();
    expect(String(fetchMock.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
    expect(bodyOf(fetchMock.mock.calls[1]).model).toBe("gemini-2.5-flash");
    expect(bodyOf(fetchMock.mock.calls[1]).reasoning_effort).toBe("none");
    const backupInit = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = backupInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer backup-test-key-not-real");
  });

  it("does not call Gemini when NVIDIA returns 200", async () => {
    rememberEnv();
    process.env.AI_PROVIDER = "nvidia";
    process.env.AI_API_KEY = "nvapi-test-primary";
    process.env.AI_API_BASE_URL = NVIDIA;
    process.env.AI_API_KEY_BACKUP = "backup-test-key-not-real";
    process.env.AI_API_BASE_URL_BACKUP = GEMINI;
    process.env.AI_MODEL_BACKUP = "gemini-2.5-flash";
    const fetchMock = vi.fn().mockResolvedValueOnce(chatOk("meta/llama-3.1-70b-instruct", "llama"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createHttpAiProvider();
    const result = await provider!.complete(completeInput);

    expect(result.text).toBe("llama");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("integrate.api.nvidia.com");
  });

  it("logs the HTTP detail without the api key", async () => {
    rememberEnv();
    process.env.AI_PROVIDER = "nvidia";
    process.env.AI_API_KEY = "nvapi-test-primary";
    process.env.AI_API_BASE_URL = NVIDIA;
    delete process.env.AI_API_KEY_BACKUP;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "rejected nvapi-test-primary" } }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const provider = createHttpAiProvider();
    await expect(provider!.complete(completeInput)).rejects.toMatchObject({ code: "HTTP_400" });
    const logged = spy.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logged).toContain("[ai] http status=400 detail=");
    expect(logged).not.toContain("nvapi-test-primary");
  });

  it("logs backup key rejected without the secret when Gemini returns 401", async () => {
    rememberEnv();
    process.env.AI_PROVIDER = "nvidia";
    process.env.AI_API_KEY = "nvapi-test-primary";
    process.env.AI_API_BASE_URL = NVIDIA;
    process.env.AI_API_KEY_BACKUP = "backup-secret-value-123456";
    process.env.AI_API_BASE_URL_BACKUP = GEMINI;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("quota", { status: 429 }))
      .mockResolvedValueOnce(new Response("Please pass a valid API key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const provider = createHttpAiProvider();
    await expect(provider!.complete(completeInput)).rejects.toMatchObject({ code: "HTTP_401" });
    const logged = spy.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
    expect(logged).toContain("[ai] backup key rejected");
    expect(logged).not.toContain("backup-secret-value-123456");
  });

  it("keeps the NVIDIA HTTP error when no backup key is set", async () => {
    rememberEnv();
    process.env.AI_PROVIDER = "nvidia";
    process.env.AI_API_KEY = "nvapi-test-primary";
    process.env.AI_API_BASE_URL = NVIDIA;
    delete process.env.AI_API_KEY_BACKUP;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createHttpAiProvider();
    await expect(provider!.complete(completeInput)).rejects.toMatchObject({ code: "HTTP_429" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call a private backup base", async () => {
    rememberEnv();
    process.env.AI_PROVIDER = "nvidia";
    process.env.AI_API_KEY = "nvapi-test-primary";
    process.env.AI_API_BASE_URL = NVIDIA;
    process.env.AI_API_KEY_BACKUP = "backup-test-key-not-real";
    process.env.AI_API_BASE_URL_BACKUP = "http://127.0.0.1/v1";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createHttpAiProvider();
    await expect(provider!.complete(completeInput)).rejects.toMatchObject({ code: "HTTP_429" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("integrate.api.nvidia.com");
  });

  it("treats the backup key as a secret in the model package", () => {
    rememberEnv();
    process.env.AI_API_KEY_BACKUP = "backup-secret-value-123456";
    expect(packageContainsSecret("texto backup-secret-value-123456")).toBe(true);
    expect(packageContainsSecret("texto sem segredo")).toBe(false);
  });
});
