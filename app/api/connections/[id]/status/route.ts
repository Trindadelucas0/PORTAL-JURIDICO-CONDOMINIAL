import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { whatsappService } from "@/lib/services/whatsapp-service";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const status = await whatsappService.status(id);
    return ok(status);
  } catch (error) {
    return handleRouteError(error);
  }
}
