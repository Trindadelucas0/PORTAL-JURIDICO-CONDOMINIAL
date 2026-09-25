import { afterEach, describe, expect, it, vi } from "vitest";
import { EvolutionBaileysProvider, evoFetch } from "@/lib/channels/evolution-baileys-provider";

function hungFetch(_url: string, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) {
      reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
      return;
    }
    signal.addEventListener("abort", () => {
      reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
    });
  });
}

describe("evoFetch timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EVO_FETCH_TIMEOUT_MS;
  });

  it("aborts a hung fetch without a second POST", async () => {
    process.env.EVO_FETCH_TIMEOUT_MS = "40";
    process.env.EVOLUTION_API_URL = "http://evolution.test";
    process.env.EVOLUTION_APIKEY = "test-key";
    const fetchMock = vi.fn(hungFetch);
    vi.stubGlobal("fetch", fetchMock);
    await expect(evoFetch("http://evolution.test/instance/create", { method: "POST" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("send does not retry another destination after abort", async () => {
    process.env.EVO_FETCH_TIMEOUT_MS = "40";
    process.env.EVOLUTION_API_URL = "http://evolution.test";
    process.env.EVOLUTION_APIKEY = "test-key";
    const fetchMock = vi.fn(hungFetch);
    vi.stubGlobal("fetch", fetchMock);
    const provider = new EvolutionBaileysProvider();
    await expect(provider.send({ toE164: "5511999000012@lid", body: "oi" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
