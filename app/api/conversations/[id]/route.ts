import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = paramsSchema.parse(await ctx.params);
    const row = await atendimentoService.removeFromSystem(user, id);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
