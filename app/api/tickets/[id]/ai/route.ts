import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { requireTicketAccess } from "@/lib/auth/ticket-access";
import { readTicketCopilot } from "@/lib/ai/copilot-read";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const ticket = await requireTicketAccess(user, id, prisma);
    const summary = await readTicketCopilot(prisma, { id: ticket.id, conversationId: ticket.conversationId });
    return ok(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
