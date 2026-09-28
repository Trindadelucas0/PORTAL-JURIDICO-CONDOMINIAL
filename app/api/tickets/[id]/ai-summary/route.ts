import { notFound, unprocessable } from "@/lib/api/errors";
import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { requireTicketAccess } from "@/lib/auth/ticket-access";
import { parseCopilotVersion, readTicketCopilot, readTicketCopilotRevision } from "@/lib/ai/copilot-read";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const ticket = await requireTicketAccess(user, id, prisma);
    const version = parseCopilotVersion(new URL(request.url).searchParams.get("version"));
    if (version === "invalid") throw unprocessable("Versão inválida");
    if (version === "absent") {
      const summary = await readTicketCopilot(prisma, { id: ticket.id, conversationId: ticket.conversationId });
      return ok(summary);
    }
    if (!ticket.conversationId) throw notFound("Versão não encontrada");
    const revision = await readTicketCopilotRevision(prisma, ticket.conversationId, version);
    if (!revision) throw notFound("Versão não encontrada");
    return ok({ revision });
  } catch (error) {
    return handleRouteError(error);
  }
}
