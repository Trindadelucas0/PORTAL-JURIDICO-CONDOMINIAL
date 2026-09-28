import { notFound, unprocessable } from "@/lib/api/errors";
import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { parseCopilotVersion, readConversationCopilot, readTicketCopilotRevision } from "@/lib/ai/copilot-read";
import { prisma } from "@/lib/db/prisma";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    await atendimentoService.getConversationForUser(user, id);
    const version = parseCopilotVersion(new URL(request.url).searchParams.get("version"));
    if (version === "invalid") throw unprocessable("Versão inválida");
    if (version === "absent") {
      const summary = await readConversationCopilot(prisma, id);
      return ok(summary);
    }
    const revision = await readTicketCopilotRevision(prisma, id, version);
    if (!revision) throw notFound("Versão não encontrada");
    return ok({ revision });
  } catch (error) {
    return handleRouteError(error);
  }
}
