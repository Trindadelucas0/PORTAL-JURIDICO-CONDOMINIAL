import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireAdmin } from "@/lib/auth/guards";
import { automationService } from "@/lib/services/automation-service";

export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    const url = new URL(request.url);
    const { page, pageSize, q } = parsePage(request);
    const period = url.searchParams.get("period") || "today";
    const status = url.searchParams.get("status") || undefined;
    const ruleId = url.searchParams.get("ruleId") || undefined;
    const result = await automationService.listExecutions(user, { period, status, ruleId, q, page, pageSize });
    return ok(result.items, { page: result.page, pageSize: result.pageSize, total: result.total });
  } catch (error) {
    return handleRouteError(error);
  }
}
