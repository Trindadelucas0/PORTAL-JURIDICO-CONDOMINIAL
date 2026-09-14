import { ok } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { toPublicUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await requireSession();
    return ok({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
