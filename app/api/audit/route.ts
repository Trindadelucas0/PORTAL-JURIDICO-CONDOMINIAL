import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireAdmin } from "@/lib/auth/guards";
import { auditService } from "@/lib/services/audit-service";

export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    const { page, pageSize } = parsePage(request);
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType") || undefined;
    const entityId = url.searchParams.get("entityId") || undefined;
    const result = await auditService.list(user, page, pageSize, entityType, entityId);
    return ok(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
