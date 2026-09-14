import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireSession } from "@/lib/auth/guards";
import { deadlineService } from "@/lib/services/deadline-service";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const { page, pageSize } = parsePage(request);
    const url = new URL(request.url);
    const overdueOnly = url.searchParams.get("overdue") === "1";
    const result = await deadlineService.list(user, page, pageSize, overdueOnly);
    return ok(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const row = await deadlineService.create(user, await request.json());
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
