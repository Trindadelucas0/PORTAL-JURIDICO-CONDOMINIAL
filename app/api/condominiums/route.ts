import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireAdmin, requireSession } from "@/lib/auth/guards";
import { cadastroService } from "@/lib/services/cadastro-service";

export async function GET(request: Request) {
  try {
    await requireSession();
    const { page, pageSize } = parsePage(request);
    const result = await cadastroService.listCondominiums(page, pageSize);
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
    await requireAdmin();
    const row = await cadastroService.createCondominium(await request.json());
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
