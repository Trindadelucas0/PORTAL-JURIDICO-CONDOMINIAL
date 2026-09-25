import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { systemDocumentService } from "@/lib/services/system-document-service";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const row = await systemDocumentService.renameCategory(user, id, await request.json());
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(_request);
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const row = await systemDocumentService.deleteCategory(user, id);
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
