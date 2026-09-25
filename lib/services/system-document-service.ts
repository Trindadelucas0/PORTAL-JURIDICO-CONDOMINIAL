import { createHash } from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { writeAudit } from "@/lib/services/audit-service";

export const categoryNomeSchema = z.object({
  nome: z.string().trim().min(2).max(80),
});

export const systemDocumentFichaSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  purpose: z.string().trim().min(10).max(2000),
  whenToUse: z.string().trim().min(10).max(2000),
  searchHints: z.string().trim().min(10).max(2000),
});

function assertAdminUser(user: User) {
  if (!isAdmin(user)) throw forbidden("Acesso restrito a administradores");
}

function isUniqueNome(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export function createSystemDocumentService(db: PrismaClient = defaultPrisma) {
  return {
    async listCategories() {
      const [cats, groups] = await Promise.all([
        db.systemDocumentCategory.findMany({ orderBy: { nome: "asc" } }),
        db.systemDocument.groupBy({
          by: ["categoryId"],
          _count: { _all: true },
          _max: { createdAt: true },
        }),
      ]);
      const stats = new Map(groups.map((g) => [g.categoryId, g]));
      return cats.map((c) => {
        const g = stats.get(c.id);
        return {
          id: c.id,
          nome: c.nome,
          count: g?._count._all ?? 0,
          lastAt: g?._max.createdAt ?? null,
        };
      });
    },

    async createCategory(user: User, input: unknown) {
      assertAdminUser(user);
      const { nome } = categoryNomeSchema.parse(input);
      try {
        const row = await db.systemDocumentCategory.create({ data: { nome } });
        await writeAudit(db, {
          actorId: user.id,
          action: "system_document_category.create",
          entityType: "system_document_category",
          entityId: row.id,
          after: { id: row.id, nome: row.nome },
        });
        return row;
      } catch (err) {
        if (isUniqueNome(err)) throw conflict("Já existe uma categoria com esse nome");
        throw err;
      }
    },

    async renameCategory(user: User, id: string, input: unknown) {
      assertAdminUser(user);
      const { nome } = categoryNomeSchema.parse(input);
      const existing = await db.systemDocumentCategory.findFirst({ where: { id } });
      if (!existing) throw notFound("Categoria não encontrada");
      try {
        const row = await db.systemDocumentCategory.update({ where: { id }, data: { nome } });
        await writeAudit(db, {
          actorId: user.id,
          action: "system_document_category.rename",
          entityType: "system_document_category",
          entityId: row.id,
          before: { nome: existing.nome },
          after: { nome: row.nome },
        });
        return row;
      } catch (err) {
        if (isUniqueNome(err)) throw conflict("Já existe uma categoria com esse nome");
        throw err;
      }
    },

    async deleteCategory(user: User, id: string) {
      assertAdminUser(user);
      const existing = await db.systemDocumentCategory.findFirst({
        where: { id },
        include: { _count: { select: { documents: true } } },
      });
      if (!existing) throw notFound("Categoria não encontrada");
      if (existing._count.documents > 0) {
        throw unprocessable("Esvazie a categoria antes");
      }
      await db.systemDocumentCategory.delete({ where: { id } });
      await writeAudit(db, {
        actorId: user.id,
        action: "system_document_category.delete",
        entityType: "system_document_category",
        entityId: id,
        before: { nome: existing.nome },
      });
      return { id };
    },

    async list(_user: User, page: number, pageSize: number, categoryId: string) {
      const cat = await db.systemDocumentCategory.findFirst({ where: { id: categoryId } });
      if (!cat) throw notFound("Categoria não encontrada");
      const where = { categoryId };
      const [total, items] = await Promise.all([
        db.systemDocument.count({ where }),
        db.systemDocument.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { category: { select: { id: true, nome: true } } },
        }),
      ]);
      return { items, total, page, pageSize };
    },

    async upload(
      user: User,
      input: {
        categoryId?: string;
        title: string;
        purpose: string;
        whenToUse: string;
        searchHints: string;
        file: { buffer: Buffer; name: string; mime: string };
      },
    ) {
      assertAdminUser(user);
      if (!input.categoryId) throw unprocessable("Informe a categoria");
      const ficha = systemDocumentFichaSchema.parse({
        categoryId: input.categoryId,
        title: input.title,
        purpose: input.purpose,
        whenToUse: input.whenToUse,
        searchHints: input.searchHints,
      });
      const cat = await db.systemDocumentCategory.findFirst({ where: { id: ficha.categoryId } });
      if (!cat) throw notFound("Categoria não encontrada");
      const stored = await localDiskStorage.save(input.file.buffer, input.file.name, input.file.mime);
      const sha256 = createHash("sha256").update(input.file.buffer).digest("hex");
      const doc = await db.systemDocument.create({
        data: {
          categoryId: cat.id,
          uploadedById: user.id,
          title: ficha.title,
          purpose: ficha.purpose,
          whenToUse: ficha.whenToUse,
          searchHints: ficha.searchHints,
          storageKey: stored.storageKey,
          mime: stored.mime,
          sizeBytes: stored.sizeBytes,
          originalName: stored.originalName,
          sha256,
        },
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "system_document.create",
        entityType: "system_document",
        entityId: doc.id,
        after: {
          id: doc.id,
          categoryId: doc.categoryId,
          title: doc.title,
          purpose: doc.purpose,
          whenToUse: doc.whenToUse,
          searchHints: doc.searchHints,
          originalName: doc.originalName,
        },
      });
      return doc;
    },

    async authorizeRead(_user: User, storageKey: string) {
      const doc = await db.systemDocument.findFirst({ where: { storageKey } });
      if (!doc) throw notFound("Arquivo não encontrado");
      return doc;
    },

    async findByStorageKey(storageKey: string) {
      return db.systemDocument.findFirst({ where: { storageKey } });
    },
  };
}

export const systemDocumentService = createSystemDocumentService();
