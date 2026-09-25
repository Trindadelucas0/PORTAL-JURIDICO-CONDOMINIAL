import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { payloadTooLarge, tooMany } from "@/lib/api/errors";
import { clientIp, rateLimit } from "@/lib/api/rate-limit";
import { maybeDumpEvolutionWebhookBody } from "@/lib/channels/evolution-webhook";
import { whatsappService } from "@/lib/services/whatsapp-service";

export const WEBHOOK_MAX_BYTES = 256 * 1024;

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > WEBHOOK_MAX_BYTES) {
      throw payloadTooLarge();
    }

    const secret =
      request.headers.get("x-evolution-secret") || request.headers.get("apikey");
    try {
      whatsappService.assertWebhookSecret(secret);
    } catch (error) {
      const limited = rateLimit(`webhook-auth:${clientIp(request)}`, 30, 10 * 60 * 1000);
      if (!limited.ok) {
        throw tooMany("Webhook rate limited");
      }
      throw error;
    }

    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.byteLength > WEBHOOK_MAX_BYTES) {
      throw payloadTooLarge();
    }

    let body: unknown;
    try {
      body = JSON.parse(buf.toString("utf8"));
    } catch {
      return ok({ ignored: true as const, reason: "malformed" });
    }

    maybeDumpEvolutionWebhookBody(body);

    const result = await whatsappService.ingestEvolution(body);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
