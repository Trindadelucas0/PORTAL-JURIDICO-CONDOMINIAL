import { created } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { documentService } from "@/lib/services/document-service";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const row = await documentService.queueWhatsAppDraft(user, id);
    return created(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
