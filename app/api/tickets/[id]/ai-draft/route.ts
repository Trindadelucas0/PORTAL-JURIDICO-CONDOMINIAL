import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { requireTicketAccess } from "@/lib/auth/ticket-access";
import { sendCopilotDraft, updateCopilotDraft } from "@/lib/ai/copilot-draft";
import { prisma } from "@/lib/db/prisma";

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

async function conversationIdOf(user: Awaited<ReturnType<typeof requireSession>>, ticketId: string) {
  const ticket = await requireTicketAccess(user, ticketId, prisma);
  if (!ticket.conversationId) throw notFound("Versão não encontrada");
  return ticket.conversationId;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const conversationId = await conversationIdOf(user, id);
    const body = patchSchema.parse(await request.json());
    return ok(await updateCopilotDraft(prisma, conversationId, body.version, body.text));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const conversationId = await conversationIdOf(user, id);
    const body = sendSchema.parse(await request.json());
    return ok(await sendCopilotDraft(prisma, user, conversationId, body.version));
  } catch (error) {
    return handleRouteError(error);
  }
}
