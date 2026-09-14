import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { deadlineService } from "@/lib/services/deadline-service";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const row = await deadlineService.patch(user, id, await request.json());
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
