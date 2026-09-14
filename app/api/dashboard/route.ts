import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { atendimentoService } from "@/lib/services/atendimento-service";

export async function GET() {
  try {
    const user = await requireSession();
    const data = await atendimentoService.dashboardKpis(user);
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
