import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin, requireSession } from "@/lib/auth/guards";
import { systemDocumentService } from "@/lib/services/system-document-service";

export async function GET() {
  try {
    await requireSession();
    const items = await systemDocumentService.listCategories();
    return ok(items, { total: items.length });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const user = await requireAdmin();
    const row = await systemDocumentService.createCategory(user, await request.json());
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
