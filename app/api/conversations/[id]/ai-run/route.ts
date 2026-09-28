import { created } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { startManualAiRun } from "@/lib/ai/manual-run";
import { prisma } from "@/lib/db/prisma";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const conversation = await atendimentoService.getConversationForUser(user, id);
    const row = await startManualAiRun(prisma, {
      conversationId: conversation.id,
      condominiumId: conversation.condominiumId,
    });
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
