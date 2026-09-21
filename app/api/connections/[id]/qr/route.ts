import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { whatsappService } from "@/lib/services/whatsapp-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const qr = await whatsappService.qr(id, fresh ? { fresh: true } : undefined);
    return ok(qr);
  } catch (error) {
    return handleRouteError(error);
  }
}
