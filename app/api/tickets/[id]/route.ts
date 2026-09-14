import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { ticketService } from "@/lib/services/ticket-service";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const ticket = await ticketService.get(user, id);
    return ok(ticket);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const ticket = await ticketService.patch(user, id, await request.json());
    return ok(ticket);
  } catch (error) {
    return handleRouteError(error);
  }
}
