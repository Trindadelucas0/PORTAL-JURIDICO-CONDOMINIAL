import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireAdmin, requireSession } from "@/lib/auth/guards";
import { unprocessable } from "@/lib/api/errors";
import { systemDocumentService } from "@/lib/services/system-document-service";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const { page, pageSize } = parsePage(request);
    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId") || "";
    if (!categoryId) throw unprocessable("Informe a categoria");
    const result = await systemDocumentService.list(user, page, pageSize, categoryId);
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
    const user = await requireAdmin();
    const form = await request.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File) || uploaded.size === 0) {
      throw unprocessable("Arquivo obrigatório");
    }
    const doc = await systemDocumentService.upload(user, {
      categoryId: String(form.get("categoryId") || "") || undefined,
      title: String(form.get("title") || ""),
      purpose: String(form.get("purpose") || ""),
      whenToUse: String(form.get("whenToUse") || ""),
      searchHints: String(form.get("searchHints") || ""),
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
