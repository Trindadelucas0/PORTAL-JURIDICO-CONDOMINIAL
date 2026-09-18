import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { documentService } from "@/lib/services/document-service";

export async function GET() {
  try {
    const user = await requireSession();
    const items = await documentService.summaryByCondominium(user);
    return ok(items, { total: items.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
