import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { automationService } from "@/lib/services/automation-service";

export async function GET() {
  try {
    const user = await requireAdmin();
    return ok(await automationService.list(user));
  } catch (error) {
    return handleRouteError(error);
  }
}
