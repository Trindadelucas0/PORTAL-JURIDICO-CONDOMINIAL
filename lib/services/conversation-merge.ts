import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export async function mergeConversations(db: Db, keeperId: string, sourceId: string): Promise<string> {
  if (keeperId === sourceId) return keeperId;

  await db.message.updateMany({
    where: { conversationId: sourceId },
    data: { conversationId: keeperId },
  });
  await db.ticket.updateMany({
    where: { conversationId: sourceId },
    data: { conversationId: keeperId },
  });

  const sourceReads = await db.conversationRead.findMany({ where: { conversationId: sourceId } });
  for (const row of sourceReads) {
    const existing = await db.conversationRead.findUnique({
      where: { userId_conversationId: { userId: row.userId, conversationId: keeperId } },
    });
    if (!existing) {
      await db.conversationRead.create({
        data: { userId: row.userId, conversationId: keeperId, lastReadAt: row.lastReadAt },
      });
    } else if (row.lastReadAt > existing.lastReadAt) {
      await db.conversationRead.update({
        where: { userId_conversationId: { userId: row.userId, conversationId: keeperId } },
        data: { lastReadAt: row.lastReadAt },
      });
    }
  }
  await db.conversationRead.deleteMany({ where: { conversationId: sourceId } });

  await db.automationExecution.updateMany({
    where: { conversationId: sourceId },
    data: { conversationId: keeperId },
  });

  const sourceTriage = await db.triageItem.findUnique({ where: { conversationId: sourceId } });
  const keeperTriage = await db.triageItem.findUnique({ where: { conversationId: keeperId } });
  if (sourceTriage && keeperTriage) {
    if (keeperTriage.status === "arquivado" && sourceTriage.status === "aberto") {
      await db.triageItem.update({ where: { id: keeperTriage.id }, data: { status: "aberto" } });
    }
    await db.triageItem.delete({ where: { id: sourceTriage.id } });
  } else if (sourceTriage && !keeperTriage) {
    await db.triageItem.update({
      where: { id: sourceTriage.id },
      data: { conversationId: keeperId },
    });
  }

  await db.conversation.delete({ where: { id: sourceId } });
  return keeperId;
}
