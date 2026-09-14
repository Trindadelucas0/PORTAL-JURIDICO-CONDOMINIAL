import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { whatsappService } from "@/lib/services/whatsapp-service";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    await requireAdmin();
    const { id } = await ctx.params;
    const row = await whatsappService.patch(id, await request.json());
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
