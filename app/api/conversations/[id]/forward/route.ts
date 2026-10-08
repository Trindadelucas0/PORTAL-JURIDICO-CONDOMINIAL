import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  assignedToId: z.string().uuid(),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireAdmin();
    const { id } = paramsSchema.parse(await ctx.params);
    const body = bodySchema.parse(await request.json());
    const row = await atendimentoService.forward(user, id, body);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
