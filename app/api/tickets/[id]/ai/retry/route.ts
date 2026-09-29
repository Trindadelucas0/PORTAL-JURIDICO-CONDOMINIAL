import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { requeueFailedTicketJobs } from "@/lib/ai/queue-admin";
import { writeAudit } from "@/lib/services/audit-service";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const result = await requeueFailedTicketJobs(prisma, id);
    await writeAudit(prisma, {
      actorId: user.id,
      action: "ai.retry",
      entityType: "ticket",
      entityId: id,
      after: result,
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
