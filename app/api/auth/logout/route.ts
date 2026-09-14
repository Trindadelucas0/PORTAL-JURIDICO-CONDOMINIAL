import { cookies } from "next/headers";
import { ok } from "@/lib/api/envelope";
import { handleRouteError, assertCsrf } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    await requireSession();
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(token);
    jar.delete(SESSION_COOKIE);
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
