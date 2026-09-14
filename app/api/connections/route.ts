import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { whatsappService } from "@/lib/services/whatsapp-service";

export async function GET() {
  try {
    await requireAdmin();
    const items = await whatsappService.list();
    return ok(items);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    await requireAdmin();
    const row = await whatsappService.create(await request.json());
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
