import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { isAiEnabled } from "@/lib/ai/flags";
import { listContactMemory } from "@/lib/ai/contact-memory";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const items = await listContactMemory(prisma, id);
    return ok({ enabled: isAiEnabled(), items });
  } catch (error) {
    return handleRouteError(error);
  }
}
