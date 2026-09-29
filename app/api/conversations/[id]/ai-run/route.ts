import { z } from "zod";
import { created } from "@/lib/api/envelope";
import { unprocessable } from "@/lib/api/errors";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { startManualAiRun } from "@/lib/ai/manual-run";
import { prisma } from "@/lib/db/prisma";
import { atendimentoService } from "@/lib/services/atendimento-service";

const bodySchema = z.object({
  messageIds: z.array(z.string().max(64)).max(200).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const body = await readBody(request);
    const conversation = await atendimentoService.getConversationForUser(user, id);
    const row = await startManualAiRun(prisma, {
      conversationId: conversation.id,
      condominiumId: conversation.condominiumId,
      messageIds: body.messageIds,
    });
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}

async function readBody(request: Request): Promise<z.infer<typeof bodySchema>> {
  const text = await request.text();
  if (!text.trim()) return {};
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw unprocessable("Corpo inválido");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) throw unprocessable("Mensagens marcadas inválidas");
  return parsed.data;
}
