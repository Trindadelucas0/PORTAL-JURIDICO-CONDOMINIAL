import { z } from "zod";
import { created, fail } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

const schema = z.object({
  fromPhone: z.string().min(8),
  body: z.string().min(1).max(4000),
  waMessageId: z.string().min(4).max(80).optional(),
});

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV !== "development") {
      return fail(404, "NOT_FOUND", "Não encontrado");
    }
    assertCsrf(request);
    await requireAdmin();
    const data = schema.parse(await request.json());
    const result = await atendimentoService.ingestInbound({
      waMessageId: data.waMessageId || `dev-${crypto.randomUUID()}`,
      fromPhone: data.fromPhone,
      body: data.body,
      connectionType: "dev_mock",
    });
    return created(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
