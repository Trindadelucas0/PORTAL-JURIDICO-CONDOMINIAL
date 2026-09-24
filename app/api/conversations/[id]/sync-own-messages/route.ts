import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const result = await atendimentoService.syncOwnOutboundMessages(user, id);
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
