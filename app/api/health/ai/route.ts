import { prisma } from "@/lib/db/prisma";
import { handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { aiOpsSnapshot } from "@/lib/ai/ops";
import { probeAiProviders } from "@/lib/ai/provider-health";
import { ok } from "@/lib/api/envelope";

export async function GET() {
  try {
    await requireAdmin();
    const [snapshot, providers] = await Promise.all([aiOpsSnapshot(prisma), probeAiProviders()]);
    return ok({ ...snapshot, providers });
  } catch (error) {
    return handleRouteError(error);
  }
}
