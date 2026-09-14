import { z } from "zod";
import { cookies } from "next/headers";
import { created, fail } from "@/lib/api/envelope";
import { handleRouteError } from "@/lib/api/handler";
import { clientIp, rateLimit } from "@/lib/api/rate-limit";
import { prisma } from "@/lib/db/prisma";
import {
  cookieOptions,
  createSession,
  SESSION_COOKIE,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`login:${clientIp(request)}`, 10, 15 * 60 * 1000);
    if (!limited.ok) {
      return fail(429, "RATE_LIMITED", "Muitas tentativas. Tente novamente em instantes.");
    }
    const body = loginSchema.parse(await request.json());
    const user = await prisma.user.findFirst({
      where: { email: body.email.toLowerCase(), deletedAt: null },
    });
    const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !user.ativo || !valid) {
      return fail(401, "UNAUTHORIZED", "Credenciais inválidas");
    }
    const { token, expiresAt } = await createSession(user.id);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
    return created({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
