import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { cadastroService } from "@/lib/services/cadastro-service";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const row = await cadastroService.patchContact(user, id, await request.json());
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
