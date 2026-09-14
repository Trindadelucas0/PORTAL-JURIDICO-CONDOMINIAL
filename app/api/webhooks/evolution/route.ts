import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { whatsappService } from "@/lib/services/whatsapp-service";

export async function POST(request: Request) {
  try {
    const secret =
      request.headers.get("x-evolution-secret") || request.headers.get("apikey");
    whatsappService.assertWebhookSecret(secret);
    const result = await whatsappService.ingestEvolution(await request.json());
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
