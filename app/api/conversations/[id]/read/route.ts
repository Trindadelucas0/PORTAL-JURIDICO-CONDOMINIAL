import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(_request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const row = await atendimentoService.markRead(user, id);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
