import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { aiUsageSnapshot } from "@/lib/ai/queue-admin";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await aiUsageSnapshot(prisma));
  } catch (error) {
    return handleRouteError(error);
  }
}
