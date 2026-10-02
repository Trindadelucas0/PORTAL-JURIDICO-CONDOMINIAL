import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { startRejectedSummaryRun } from "@/lib/ai/manual-run";
import { prisma } from "@/lib/db/prisma";
import { atendimentoService } from "@/lib/services/atendimento-service";

const bodySchema = z
  .object({
    version: z.number().int().positive(),
  })
  .strict();

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const conversation = await atendimentoService.getConversationForUser(user, id);
    const body = bodySchema.parse(await request.json());
    return ok(
      await startRejectedSummaryRun(prisma, user, {
        conversationId: conversation.id,
        condominiumId: conversation.condominiumId,
        version: body.version,
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
