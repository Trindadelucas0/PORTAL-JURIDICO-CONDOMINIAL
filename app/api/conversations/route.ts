import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireSession } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const { page, pageSize, q } = parsePage(request);
    const url = new URL(request.url);
    const unread = url.searchParams.get("unread") === "1";
    const untreated = url.searchParams.get("untreated") === "1";
    const unlinked = url.searchParams.get("unlinked") === "1";
    const result = await atendimentoService.listConversations(user, page, pageSize, q, {
      unread,
      untreated,
      unlinked,
    });
    return ok(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
