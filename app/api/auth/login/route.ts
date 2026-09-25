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
  verifyLoginPassword,
} from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const email = body.email.toLowerCase();
    const ipLimited = rateLimit(`login:ip:${clientIp(request)}`, 30, LOGIN_WINDOW_MS);
    const emailLimited = rateLimit(`login:email:${email}`, 10, LOGIN_WINDOW_MS);
    if (!ipLimited.ok || !emailLimited.ok) {
      return fail(429, "RATE_LIMITED", "Muitas tentativas. Tente novamente em instantes.");
    }
    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    const valid = await verifyLoginPassword(body.password, user?.passwordHash);
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
