import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { approvalService } from "@/lib/services/approval-service";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const message = await approvalService.reject(user, id);
    return ok({ id: message.id, sendStatus: message.sendStatus });
  } catch (error) {
    return handleRouteError(error);
  }
}
