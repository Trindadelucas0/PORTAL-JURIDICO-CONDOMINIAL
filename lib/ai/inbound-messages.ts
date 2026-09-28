import { jobKeysNeedLatestInbound } from "@/lib/ai/enqueue";

export type InboundRow = { id: string; body: string };

type MessageLookup = {
  findMany(args: {
    where: { conversationId?: string; direction?: "in"; id?: { in: string[] } };
    orderBy: { createdAt: "asc" | "desc" };
    take?: number;
    select: { id: true; body: true };
  }): Promise<InboundRow[]>;
};

/** Job manual (`manual:…`) não é id de Message: usa as últimas inbound da conversa. */
export async function loadInboundForJobs(
  messages: MessageLookup,
  conversationId: string,
  keys: string[],
): Promise<InboundRow[]> {
  if (jobKeysNeedLatestInbound(keys)) {
    const rows = await messages.findMany({
      where: { conversationId, direction: "in" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, body: true },
    });
    return [...rows].reverse();
  }
  const ids = keys.filter((key) => !key.startsWith("manual:"));
  if (!ids.length) return [];
  return messages.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true },
  });
}
