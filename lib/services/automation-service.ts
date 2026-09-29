import { Prisma, type PrismaClient, type User } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isAdmin } from "@/lib/auth/guards";
import { decideFirstMessage } from "@/lib/automations/first-message";
import { automationPatchSchema, unknownVariableMessage } from "@/lib/automations/schema";
import { renderTemplate } from "@/lib/automations/template";
import { writeAudit } from "@/lib/services/audit-service";
import { deliverStoredPublicMessage } from "@/lib/services/whatsapp-dispatch";
import {
  businessDateKey,
  businessDayRange,
  formatBusinessTime,
  formatLastExecution,
  isWindowOrdered,
  isWithinBusinessWindow,
  shiftBusinessDate,
} from "@/lib/time/business-clock";

type Db = PrismaClient | Prisma.TransactionClient;

const RULE_SELECT = {
  id: true,
  nome: true,
  trigger: true,
  ativo: true,
  body: true,
  startsAt: true,
  endsAt: true,
  skipActiveTicket: true,
  activatedAt: true,
  updatedAt: true,
} as const;

function assertAdminUser(user: User) {
  if (!isAdmin(user)) throw forbidden("Acesso restrito a administradores");
}

function statusLabel(status: string) {
  if (status === "sent") return "Enviada";
  if (status === "failed") return "Falhou";
  if (status === "skipped") return "Não enviada";
  return "Reservada";
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function auditExecution(
  db: Db,
  execution: {
    id: string;
    ruleId: string;
    contactId: string;
    conversationId: string;
    inboundMessageId: string;
    businessDate: string;
  },
  status: "sent" | "failed" | "skipped",
  extra: { outboundMessageId?: string | null; reason?: string | null; errorCode?: string | null },
) {
  const action = status === "sent" ? "automation.sent" : status === "failed" ? "automation.failed" : "automation.skipped";
  await writeAudit(db, {
    actorId: null,
    action,
    entityType: "automationExecution",
    entityId: execution.id,
    after: {
      ruleId: execution.ruleId,
      contactId: execution.contactId,
      conversationId: execution.conversationId,
      inboundMessageId: execution.inboundMessageId,
      outboundMessageId: extra.outboundMessageId ?? null,
      executionId: execution.id,
      status,
      businessDate: execution.businessDate,
      reason: extra.reason ?? null,
      errorCode: extra.errorCode ?? null,
    },
  });
}

export async function processInbound(
  db: Db,
  input: {
    messageId: string;
    conversationId: string;
    contactId: string | null;
    createdAt: Date;
  },
) {
  if (!input.contactId) return;

  const rule = await db.automationRule.findFirst({
    where: { trigger: "first_message_of_day", ativo: true },
  });
  if (!rule) return;

  const businessDate = businessDateKey(input.createdAt);
  const day = businessDayRange(businessDate);
  const earlier = await db.message.findFirst({
    where: {
      id: { not: input.messageId },
      direction: "in",
      createdAt: { gte: day.start, lt: input.createdAt },
      conversation: { contactId: input.contactId },
    },
    select: { id: true },
  });
  if (earlier) return;

  let execution;
  try {
    execution = await db.automationExecution.create({
      data: {
        ruleId: rule.id,
        contactId: input.contactId,
        conversationId: input.conversationId,
        businessDate,
        status: "reserved",
        inboundMessageId: input.messageId,
      },
    });
  } catch (error) {
    if (isUniqueConflict(error)) return;
    throw error;
  }

  try {
    const withinWindow = isWithinBusinessWindow(input.createdAt, rule.startsAt, rule.endsAt);
    const activeTicket = rule.skipActiveTicket
      ? await db.ticket.findFirst({
          where: { contactId: input.contactId, status: { not: "resolvido" } },
          select: { id: true },
        })
      : null;
    const decision = decideFirstMessage({
      direction: "in",
      contactId: input.contactId,
      ruleActive: true,
      earlierInboundExists: false,
      claim: "won",
      withinWindow,
      skipActiveTicket: rule.skipActiveTicket,
      hasActiveTicket: Boolean(activeTicket),
    });

    if (decision.action === "skip") {
      await db.automationExecution.update({
        where: { id: execution.id },
        data: { status: "skipped", reason: decision.reason, executedAt: new Date() },
      });
      await auditExecution(db, execution, "skipped", { reason: decision.reason });
      return;
    }
    if (decision.action !== "send") {
      await db.automationExecution.update({
        where: { id: execution.id },
        data: { status: "failed", errorCode: "not_eligible", executedAt: new Date() },
      });
      return;
    }

    const contact = await db.contact.findFirst({
      where: { id: input.contactId },
      include: { condominium: { select: { nome: true } } },
    });
    const conversation = await db.conversation.findFirst({
      where: { id: input.conversationId },
      include: { condominium: { select: { nome: true } } },
    });
    const ticket = await db.ticket.findFirst({
      where: { contactId: input.contactId },
      orderBy: { createdAt: "desc" },
      select: { protocol: true },
    });
    const body = renderTemplate(rule.body, {
      nome: contact?.nome?.trim() || "cliente",
      condominio: contact?.condominium?.nome || conversation?.condominium?.nome || "",
      protocolo: ticket?.protocol || "",
    }).slice(0, 8000);

    const outbound = await db.message.create({
      data: {
        conversationId: input.conversationId,
        direction: "out",
        visibility: "publica",
        sendStatus: "pending",
        automated: true,
        body,
      },
    });

    let sentId: string | null = null;
    try {
      const sent = await deliverStoredPublicMessage(db, outbound.id);
      sentId = sent.id;
    } catch {
      await db.automationExecution.update({
        where: { id: execution.id },
        data: {
          status: "failed",
          outboundMessageId: outbound.id,
          errorCode: "send_failed",
          executedAt: new Date(),
        },
      });
      await auditExecution(db, execution, "failed", {
        outboundMessageId: outbound.id,
        errorCode: "send_failed",
      }).catch(() => undefined);
      return;
    }
    await db.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: "sent",
        outboundMessageId: sentId,
        executedAt: new Date(),
      },
    });
    await auditExecution(db, execution, "sent", { outboundMessageId: sentId });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "ERROR";
    await db.automationExecution.update({
      where: { id: execution.id },
      data: { status: "failed", errorCode: "send_failed", executedAt: new Date() },
    }).catch(() => undefined);
    await auditExecution(db, execution, "failed", { errorCode: "send_failed" }).catch(() => undefined);
    console.error(`[automation] errorCode=${code}`);
  }
}

function periodStart(period: string, now: Date) {
  const today = businessDateKey(now);
  if (period === "7") return businessDayRange(shiftBusinessDate(today, -6)).start;
  if (period === "30") return businessDayRange(shiftBusinessDate(today, -29)).start;
  return businessDayRange(today).start;
}

export function createAutomationService(db: PrismaClient = defaultPrisma) {
  return {
    async list(user: User) {
      assertAdminUser(user);
      const rules = await db.automationRule.findMany({
        orderBy: { createdAt: "asc" },
        select: RULE_SELECT,
      });
      const withLast = [];
      for (const rule of rules) {
        const last = await db.automationExecution.findFirst({
          where: { ruleId: rule.id, status: { in: ["sent", "failed", "skipped"] } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, status: true },
        });
        withLast.push({
          ...rule,
          activatedAt: rule.activatedAt?.toISOString() ?? null,
          updatedAt: rule.updatedAt.toISOString(),
          lastExecution: last
            ? {
                createdAt: last.createdAt.toISOString(),
                status: last.status,
                statusLabel: statusLabel(last.status),
                label: formatLastExecution(last.createdAt),
              }
            : null,
        });
      }
      return withLast;
    },

    async update(user: User, id: string, input: unknown) {
      assertAdminUser(user);
      const parsed = automationPatchSchema.safeParse(input);
      if (!parsed.success) {
        throw unprocessable(parsed.error.issues[0]?.message ?? "Dados inválidos");
      }
      const data = parsed.data;
      if (data.body) {
        const variableError = unknownVariableMessage(data.body);
        if (variableError) throw unprocessable(variableError);
      }
      const existing = await db.automationRule.findFirst({ where: { id } });
      if (!existing) throw notFound("Automação não encontrada");
      const startsAt = data.startsAt ?? existing.startsAt;
      const endsAt = data.endsAt ?? existing.endsAt;
      if (!isWindowOrdered(startsAt, endsAt)) {
        throw unprocessable("O horário final precisa ser depois do inicial");
      }
      const turningOn = data.ativo === true && !existing.ativo;
      const updated = await db.automationRule.update({
        where: { id },
        data: {
          nome: data.nome,
          body: data.body,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          skipActiveTicket: data.skipActiveTicket,
          ativo: data.ativo,
          activatedAt: turningOn && !existing.activatedAt ? new Date() : undefined,
        },
        select: RULE_SELECT,
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "automation.update",
        entityType: "automationRule",
        entityId: id,
        before: {
          nome: existing.nome,
          ativo: existing.ativo,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          skipActiveTicket: existing.skipActiveTicket,
        },
        after: {
          nome: updated.nome,
          ativo: updated.ativo,
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
          skipActiveTicket: updated.skipActiveTicket,
        },
      });
      return {
        ...updated,
        activatedAt: updated.activatedAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      };
    },

    async listExecutions(
      user: User,
      filters: { period?: string; status?: string; ruleId?: string; q?: string; page: number; pageSize: number },
    ) {
      assertAdminUser(user);
      const where: Prisma.AutomationExecutionWhereInput = {
        createdAt: { gte: periodStart(filters.period || "today", new Date()) },
      };
      if (filters.status === "sent" || filters.status === "failed" || filters.status === "skipped") {
        where.status = filters.status;
      }
      if (filters.ruleId) where.ruleId = filters.ruleId;
      if (filters.q?.trim()) {
        where.contact = { nome: { contains: filters.q.trim(), mode: "insensitive" } };
      }
      const [total, rows] = await Promise.all([
        db.automationExecution.count({ where }),
        db.automationExecution.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
          include: {
            contact: { select: { nome: true } },
            rule: { select: { nome: true } },
          },
        }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          at: row.executedAt?.toISOString() ?? row.createdAt.toISOString(),
          timeLabel: formatBusinessTime(row.executedAt ?? row.createdAt),
          contactName: row.contact.nome,
          ruleName: row.rule.nome,
          status: row.status,
          statusLabel: statusLabel(row.status),
          reason: row.reason,
        })),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
      };
    },
  };
}

export const automationService = createAutomationService();
