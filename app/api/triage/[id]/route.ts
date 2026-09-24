import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { cadastroService } from "@/lib/services/cadastro-service";
import { ticketCategorySchema, ticketPrioritySchema, ticketService } from "@/lib/services/ticket-service";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("identify"), contactId: z.string().uuid() }),
  z.object({ action: z.literal("linkCondominium"), condominiumId: z.string().uuid() }),
  z.object({
    action: z.literal("promote"),
    category: ticketCategorySchema,
    priority: ticketPrioritySchema,
    assignedToId: z.string().uuid().optional().nullable(),
    title: z.string().min(3).max(200).optional(),
  }),
]);

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const row = await cadastroService.getTriage(id);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const input = patchSchema.parse(await request.json());
    if (input.action === "promote") {
      const ticket = await ticketService.promoteFromTriage(user, id, input);
      return ok(ticket);
    }
    const row = await cadastroService.patchTriage(user, id, input);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
