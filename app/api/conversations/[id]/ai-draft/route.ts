import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { sendCopilotDraft, updateCopilotDraft } from "@/lib/ai/copilot-draft";
import { prisma } from "@/lib/db/prisma";
import { atendimentoService } from "@/lib/services/atendimento-service";

const patchSchema = z
  .object({
    version: z.number().int().positive(),
    text: z.string().trim().min(1).max(8000),
  })
  .strict();

const sendSchema = z
  .object({
    version: z.number().int().positive(),
  })
  .strict();

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    await atendimentoService.getConversationForUser(user, id);
    const body = patchSchema.parse(await request.json());
    return ok(await updateCopilotDraft(prisma, id, body.version, body.text));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    await atendimentoService.getConversationForUser(user, id);
    const body = sendSchema.parse(await request.json());
    return ok(await sendCopilotDraft(prisma, user, id, body.version));
  } catch (error) {
    return handleRouteError(error);
  }
}
