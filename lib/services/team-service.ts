import { randomBytes } from "node:crypto";
import type { PrismaClient, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/session";

const emailSchema = z.string().email().max(160).transform((v) => v.trim().toLowerCase());

export const teamCreateSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "funcionario"]),
  podeResponderCliente: z.boolean().optional().default(true),
  apenasRascunho: z.boolean().optional().default(false),
});

export const teamPatchSchema = z.object({
  id: z.string().uuid(),
  ativo: z.boolean().optional(),
  role: z.enum(["admin", "funcionario"]).optional(),
  podeResponderCliente: z.boolean().optional(),
  apenasRascunho: z.boolean().optional(),
});

function generatePassword() {
  return randomBytes(18).toString("base64url");
}

export function createTeamService(db: PrismaClient = defaultPrisma) {
  return {
    async list() {
      return db.user.findMany({
        where: { deletedAt: null },
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          role: true,
          ativo: true,
          podeResponderCliente: true,
          apenasRascunho: true,
        },
      });
    },

    async create(input: unknown) {
      const data = teamCreateSchema.parse(input);
      const exists = await db.user.findFirst({ where: { email: data.email } });
      if (exists && !exists.deletedAt) throw conflict("Já existe usuário com este e-mail");
      const plaintext = generatePassword();
      const passwordHash = await hashPassword(plaintext);
      const user = await db.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: data.role as UserRole,
          ativo: true,
          podeResponderCliente: data.role === "funcionario" ? (data.apenasRascunho ? true : data.podeResponderCliente) : data.podeResponderCliente,
          apenasRascunho: data.role === "admin" ? false : data.apenasRascunho,
        },
        select: {
          id: true,
          email: true,
          role: true,
          ativo: true,
          podeResponderCliente: true,
          apenasRascunho: true,
        },
      });
      return { user, passwordOnce: plaintext };
    },

    async patch(input: unknown) {
      const data = teamPatchSchema.parse(input);
      const user = await db.user.findFirst({ where: { id: data.id, deletedAt: null } });
      if (!user) throw notFound("Usuário não encontrado");

      const nextRole = data.role ?? user.role;
      const nextAtivo = data.ativo ?? user.ativo;
      const wasActiveAdmin = user.role === "admin" && user.ativo;
      const remainsActiveAdmin = nextRole === "admin" && nextAtivo;
      if (wasActiveAdmin && !remainsActiveAdmin) {
        const otherAdmins = await db.user.count({
          where: {
            id: { not: user.id },
            role: "admin",
            ativo: true,
            deletedAt: null,
          },
        });
        if (otherAdmins === 0) {
          throw unprocessable("Não é possível desativar ou rebaixar o último administrador");
        }
      }

      return db.user.update({
        where: { id: user.id },
        data: {
          ativo: nextAtivo,
          role: nextRole,
          podeResponderCliente: data.podeResponderCliente ?? user.podeResponderCliente,
          apenasRascunho: nextRole === "admin" ? false : (data.apenasRascunho ?? user.apenasRascunho),
        },
        select: {
          id: true,
          email: true,
          role: true,
          ativo: true,
          podeResponderCliente: true,
          apenasRascunho: true,
        },
      });
    },
  };
}

export const teamService = createTeamService();
