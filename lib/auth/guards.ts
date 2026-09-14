import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { forbidden } from "@/lib/api/errors";
import { getUserBySessionToken, requireUserFromToken, SESSION_COOKIE } from "@/lib/auth/session";

export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return getUserBySessionToken(token);
}

export async function requireSession(): Promise<User> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return requireUserFromToken(token);
}

export async function requireAdmin(): Promise<User> {
  const user = await requireSession();
  assertAdmin(user);
  return user;
}

export function assertAdmin(user: Pick<User, "role">) {
  if (user.role !== "admin") {
    throw forbidden("Acesso restrito a administradores");
  }
}

export function isAdmin(user: Pick<User, "role">) {
  return user.role === "admin";
}
