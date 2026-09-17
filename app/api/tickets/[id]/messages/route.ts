import { created } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";
import { ticketService } from "@/lib/services/ticket-service";
import { unprocessable } from "@/lib/api/errors";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const ticket = await ticketService.get(user, id);
    if (!ticket.conversationId) throw unprocessable("Chamado sem conversa para mensagens");
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
    const result = await atendimentoService.postMessage(user, ticket.conversationId, {
      body,
      visibility,
      file,
      ticketId: ticket.id,
      replyToId,
    });
    return created(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
