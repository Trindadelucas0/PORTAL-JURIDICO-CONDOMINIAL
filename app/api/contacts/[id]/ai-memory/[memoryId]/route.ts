import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { unprocessable } from "@/lib/api/errors";
import { memoryStatusSchema, patchContactMemory } from "@/lib/ai/contact-memory";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; memoryId: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireAdmin();
    void user;
    const { id, memoryId } = await ctx.params;
    const body = await request.json();
    const parsed = memoryStatusSchema.safeParse(body?.status);
    if (!parsed.success) throw unprocessable("Informe status accepted ou rejected");
    const row = await patchContactMemory(prisma, id, memoryId, parsed.data);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
