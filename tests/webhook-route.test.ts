import { describe, expect, it } from "vitest";
import { POST, WEBHOOK_MAX_BYTES } from "@/app/api/webhooks/evolution/route";

function webhookRequest(opts: { secret?: string; body?: string; ip?: string; contentLength?: string }) {
  const headers = new Headers();
  if (opts.secret) headers.set("x-evolution-secret", opts.secret);
  headers.set("content-type", "application/json");
  headers.set("cf-connecting-ip", opts.ip ?? `203.0.113.${Date.now() % 200}`);
  if (opts.contentLength) headers.set("content-length", opts.contentLength);
  return new Request("http://127.0.0.1:3010/api/webhooks/evolution", {
    method: "POST",
    headers,
    body: opts.body ?? "{}",
  });
}

describe("webhook Evolution route", () => {
  it("rejects wrong secret with 401", async () => {
    const prev = process.env.EVOLUTION_WEBHOOK_SECRET;
    process.env.EVOLUTION_WEBHOOK_SECRET = "local-webhook-secret";
    const res = await POST(webhookRequest({ secret: "wrong", body: "{}" }));
    expect(res.status).toBe(401);
    if (prev) process.env.EVOLUTION_WEBHOOK_SECRET = prev;
    else delete process.env.EVOLUTION_WEBHOOK_SECRET;
  });

  it("returns 413 when content-length exceeds the cap", async () => {
    const prev = process.env.EVOLUTION_WEBHOOK_SECRET;
    process.env.EVOLUTION_WEBHOOK_SECRET = "local-webhook-secret";
    const res = await POST(
      webhookRequest({
        secret: "local-webhook-secret",
        body: "{}",
        contentLength: String(WEBHOOK_MAX_BYTES + 1),
      }),
    );
    expect(res.status).toBe(413);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("PAYLOAD_TOO_LARGE");
    if (prev) process.env.EVOLUTION_WEBHOOK_SECRET = prev;
    else delete process.env.EVOLUTION_WEBHOOK_SECRET;
  });

  it("rate-limits repeated wrong secrets from the same IP", async () => {
    const prev = process.env.EVOLUTION_WEBHOOK_SECRET;
    process.env.EVOLUTION_WEBHOOK_SECRET = "local-webhook-secret";
    const ip = `198.51.100.${Date.now() % 200}`;
    let last = 401;
    for (let i = 0; i < 31; i++) {
      const res = await POST(webhookRequest({ secret: "wrong", body: "{}", ip }));
      last = res.status;
    }
    expect(last).toBe(429);
    if (prev) process.env.EVOLUTION_WEBHOOK_SECRET = prev;
    else delete process.env.EVOLUTION_WEBHOOK_SECRET;
  });
});
