import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { interruptIntakeSession } from "@/lib/ai/intake-close";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const conversation = await atendimentoService.getConversationForUser(user, id);
    const row = await interruptIntakeSession(prisma, conversation.id, user.id);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
