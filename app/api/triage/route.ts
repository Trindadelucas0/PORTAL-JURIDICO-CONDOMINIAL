import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireAdmin } from "@/lib/auth/guards";
import { cadastroService } from "@/lib/services/cadastro-service";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { page, pageSize } = parsePage(request);
    const result = await cadastroService.listTriage(page, pageSize);
    return ok(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
