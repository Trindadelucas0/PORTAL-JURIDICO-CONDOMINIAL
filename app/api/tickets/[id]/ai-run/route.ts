import { created } from "@/lib/api/envelope";
import { unprocessable } from "@/lib/api/errors";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { requireTicketAccess } from "@/lib/auth/ticket-access";
import { startManualAiRun } from "@/lib/ai/manual-run";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const ticket = await requireTicketAccess(user, id, prisma);
    if (!ticket.conversationId) throw unprocessable("Este chamado não tem conversa");
    const conversation = await prisma.conversation.findFirst({
      where: { id: ticket.conversationId },
      select: { id: true, condominiumId: true },
    });
    if (!conversation) throw unprocessable("Este chamado não tem conversa");
    const row = await startManualAiRun(prisma, {
      conversationId: conversation.id,
      condominiumId: conversation.condominiumId,
    });
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
