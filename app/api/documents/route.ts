import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireSession } from "@/lib/auth/guards";
import { documentService } from "@/lib/services/document-service";
import { unprocessable } from "@/lib/api/errors";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const { page, pageSize } = parsePage(request);
    const url = new URL(request.url);
    const condominiumId = url.searchParams.get("condominiumId") || undefined;
    const ticketId = url.searchParams.get("ticketId") || undefined;
    const result = await documentService.list(user, page, pageSize, condominiumId, ticketId);
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
    const form = await request.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File) || uploaded.size === 0) {
      throw unprocessable("Arquivo obrigatório");
    }
    const condominiumId = String(form.get("condominiumId") || "") || undefined;
    const ticketId = String(form.get("ticketId") || "") || undefined;
    const doc = await documentService.upload(user, {
      condominiumId,
      ticketId,
      file: {
        buffer: Buffer.from(await uploaded.arrayBuffer()),
        name: uploaded.name,
        mime: uploaded.type || "application/octet-stream",
      },
    });
    return created(doc);
  } catch (error) {
    return handleRouteError(error);
  }
}
