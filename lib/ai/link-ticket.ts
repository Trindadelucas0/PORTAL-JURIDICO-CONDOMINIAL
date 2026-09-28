import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Preenche ticketId nas linhas da conversa. Não chama modelo. */
export async function linkConversationAiToTicket(db: Db, conversationId: string, ticketId: string): Promise<void> {
  const rows = await db.$queryRaw<Array<{ ok: string | null }>>`
    SELECT to_regclass('public."AiTicketMemory"')::text AS ok
  `;
  if (!rows[0]?.ok) return;
  await db.aiTicketMemory.updateMany({
    where: { conversationId, ticketId: null },
    data: { ticketId },
  });
  await db.aiTicketMemoryRevision.updateMany({
    where: { conversationId, ticketId: null },
    data: { ticketId },
  });
  await db.aiInteraction.updateMany({
    where: { conversationId, ticketId: null },
    data: { ticketId },
  });
  await db.aiAuditEvent.updateMany({
    where: { conversationId, ticketId: null },
    data: { ticketId },
  });
}
