import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { forbidden, unprocessable } from "@/lib/api/errors";
import { isAdmin, requireSession } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/services/audit-service";
import { prisma } from "@/lib/db/prisma";

const bodySchema = z.object({
  body: z.string().trim().max(2000),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const condo = await prisma.condominium.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!condo) throw unprocessable("Condomínio não encontrado");
    if (!isAdmin(user)) throw forbidden("Somente administradores leem a regra da IA");
    const rule = await prisma.aiCondominiumRule.findFirst({
      where: { condominiumId: id },
      orderBy: { version: "desc" },
    });
    return ok({ version: rule?.version ?? 0, body: rule?.body ?? "" });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    if (!isAdmin(user)) throw forbidden("Somente administradores gravam a regra da IA");
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw unprocessable("Texto da regra inválido");
    const condo = await prisma.condominium.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!condo) throw unprocessable("Condomínio não encontrado");
    const latest = await prisma.aiCondominiumRule.findFirst({
      where: { condominiumId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const created = await prisma.aiCondominiumRule.create({
      data: { condominiumId: id, version: (latest?.version ?? 0) + 1, body: parsed.data.body },
    });
    await writeAudit(prisma, {
      actorId: user.id,
      action: "ai.condominium_rule",
      entityType: "condominium",
      entityId: id,
      after: { version: created.version },
    });
    return ok({ version: created.version, body: created.body });
  } catch (error) {
    return handleRouteError(error);
  }
}
