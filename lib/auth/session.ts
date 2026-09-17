import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { unauthorized } from "@/lib/api/errors";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export { SESSION_COOKIE };
const SESSION_DAYS = 7;

export type PublicUser = {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
  ativo: boolean;
  podeResponderCliente: boolean;
  apenasRascunho: boolean;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    nome: user.nome,
    role: user.role,
    ativo: user.ativo,
    podeResponderCliente: user.podeResponderCliente,
    apenasRascunho: user.apenasRascunho,
  };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.sessionToken.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function revokeSession(token: string) {
  await prisma.sessionToken.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function getUserBySessionToken(token: string | undefined | null) {
  if (!token) return null;
  const row = await prisma.sessionToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await prisma.sessionToken.delete({ where: { id: row.id } });
    return null;
  }
  if (!row.user.ativo || row.user.deletedAt) return null;
  return row.user;
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function requireUserFromToken(token: string | undefined | null) {
  const user = await getUserBySessionToken(token);
  if (!user) throw unauthorized();
  return user;
}
