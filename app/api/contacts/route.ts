import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireAdmin, requireSession } from "@/lib/auth/guards";
import { cadastroService } from "@/lib/services/cadastro-service";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const { page, pageSize } = parsePage(request);
    const url = new URL(request.url);
    const condominiumRaw = url.searchParams.get("condominiumId");
    const condominiumId =
      condominiumRaw && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(condominiumRaw)
        ? condominiumRaw
        : undefined;
    const result = await cadastroService.listContacts(user, page, pageSize, { condominiumId });
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
    const row = await cadastroService.createContact(await request.json());
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
