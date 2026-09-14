import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireSession } from "@/lib/auth/guards";
import { ticketService } from "@/lib/services/ticket-service";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const { page, pageSize, q } = parsePage(request);
    const result = await ticketService.list(user, page, pageSize, q);
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
    const ticket = await ticketService.createManual(user, await request.json());
    return created(ticket);
  } catch (error) {
    return handleRouteError(error);
  }
}
