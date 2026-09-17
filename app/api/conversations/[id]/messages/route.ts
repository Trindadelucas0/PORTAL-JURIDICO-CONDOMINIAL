import { created, ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { parsePage } from "@/lib/api/pagination";
import { requireSession } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const { page, pageSize } = parsePage(request);
    const result = await atendimentoService.listMessages(user, id, page, pageSize);
    return ok(result.items, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const contentType = request.headers.get("content-type") || "";
    let body = "";
    let visibility: "publica" | "interna" = "publica";
    let replyToId: string | undefined;
    let file: { buffer: Buffer; name: string; mime: string } | undefined;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = String(form.get("body") || "");
      visibility = form.get("visibility") === "interna" ? "interna" : "publica";
      const quoted = String(form.get("replyToId") || "").trim();
      if (quoted) replyToId = quoted;
      const uploaded = form.get("file");
      if (uploaded instanceof File && uploaded.size > 0) {
        file = {
          buffer: Buffer.from(await uploaded.arrayBuffer()),
          name: uploaded.name,
          mime: uploaded.type || "application/octet-stream",
        };
      }
    } else {
      const json = (await request.json()) as { body?: string; visibility?: string; replyToId?: string };
      body = json.body || "";
      visibility = json.visibility === "interna" ? "interna" : "publica";
      if (json.replyToId) replyToId = json.replyToId;
    }
    const result = await atendimentoService.postMessage(user, id, { body, visibility, file, replyToId });
    return created(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
