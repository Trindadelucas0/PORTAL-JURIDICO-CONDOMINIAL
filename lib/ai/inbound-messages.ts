import { jobKeysNeedLatestInbound, payloadMessageIds, payloadRelatoMessageIds } from "@/lib/ai/enqueue";

export type InboundRow = { id: string; body: string };

export type SelectedRow = InboundRow & { direction: "in" | "out" };

type MessageLookup = {
  findMany(args: {
    where: { conversationId?: string; direction?: "in"; id?: { in: string[] } };
    orderBy: { createdAt: "asc" | "desc" };
    take?: number;
    select: { id: true; body: true };
  }): Promise<InboundRow[]>;
};

type SelectedLookup = {
  findMany(args: {
    where: { conversationId: string; id: { in: string[] } };
    orderBy: { createdAt: "asc" };
    select: { id: true; body: true; direction: true };
  }): Promise<SelectedRow[]>;
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

/** Seleção do job mais novo do lote que tiver `payload.messageIds`; `null` quando nenhum tiver. */
export function selectedIdsForJobs(jobs: Array<{ payload: unknown }>): string[] | null {
  for (let index = jobs.length - 1; index >= 0; index--) {
    const ids = payloadMessageIds(jobs[index].payload);
    if (ids) return ids;
  }
  return null;
}

/**
 * Job mais novo do lote com `payload.relatoMessageIds` (mesmo vazio): relato e marcas separados.
 * `null` quando nenhum job tiver a chave; aí vale `selectedIdsForJobs` / últimas 20 inbound.
 */
export function relatoSplitForJobs(
  jobs: Array<{ payload: unknown }>,
): { relatoIds: string[]; markIds: string[] } | null {
  for (let index = jobs.length - 1; index >= 0; index--) {
    const relatoIds = payloadRelatoMessageIds(jobs[index].payload);
    if (relatoIds) return { relatoIds, markIds: payloadMessageIds(jobs[index].payload) ?? [] };
  }
  return null;
}

/** Mensagens marcadas, em qualquer direção, com o autor no texto. */
export async function loadSelectedMessages(
  messages: SelectedLookup,
  conversationId: string,
  ids: string[],
): Promise<SelectedRow[]> {
  const rows = await messages.findMany({
    where: { conversationId, id: { in: ids } },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, direction: true },
  });
  return rows.map((row) => ({
    ...row,
    body: `${row.direction === "in" ? "cliente" : "escritório"}: ${row.body}`,
  }));
}
