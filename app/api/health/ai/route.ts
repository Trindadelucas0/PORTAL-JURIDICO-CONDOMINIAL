import { handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { aiOpsSnapshot } from "@/lib/ai/ops";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/api/envelope";

export async function GET() {
  try {
    await requireAdmin();
    const snapshot = await aiOpsSnapshot(prisma);
    return ok(snapshot);
  } catch (error) {
    return handleRouteError(error);
  }
}
