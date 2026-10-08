import type { PrismaClient } from "@prisma/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { isMissingTable } from "@/lib/ai/errors";
import { buildCopilotRevisionView, type CopilotIndex, type CopilotRevisionView } from "@/lib/ai/copilot-view";
import { enqueueInboundMissedOnLink } from "@/lib/ai/enqueue";

export function parseCopilotVersion(raw: string | null): number | "absent" | "invalid" {
  if (raw == null || raw === "") return "absent";
  if (!/^\d+$/.test(raw)) return "invalid";
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 1) return "invalid";
  return version;
}

function emptyIndex(enabled: boolean, error = false): CopilotIndex {
  return { enabled, analyzing: false, error, currentVersion: null, history: [], current: null };
}

export async function readConversationCopilot(db: PrismaClient, conversationId: string) {
  await enqueueInboundMissedOnLink(db, conversationId);
  return readTicketCopilot(db, { id: conversationId, conversationId });
}

export async function readTicketCopilot(
  db: PrismaClient,
  ticket: { id: string; conversationId: string | null },
): Promise<CopilotIndex> {
  if (!isAiEnabled()) return emptyIndex(false);
  if (!ticket.conversationId) return emptyIndex(true);
  try {
    const conversationId = ticket.conversationId;
    const [jobs, memory, revisions] = await Promise.all([
      db.aiJob.findMany({
        where: { conversationId, type: "ai.inbound" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { status: true },
      }),
      db.aiTicketMemory.findUnique({
        where: { conversationId },
        select: { version: true },
      }),
      db.aiTicketMemoryRevision.findMany({
        where: { conversationId },
        orderBy: { version: "desc" },
        take: 20,
        select: { version: true, createdAt: true },
      }),
    ]);
    const analyzing = jobs.some((job) => job.status === "queued" || job.status === "running");
    const latest = jobs[0];
    const error = Boolean(latest && (latest.status === "failed" || latest.status === "dead") && !analyzing);
    const currentVersion = memory?.version && memory.version > 0 ? memory.version : null;
    const current = currentVersion ? await loadRevisionView(db, conversationId, currentVersion) : null;
    return {
      enabled: true,
      analyzing,
      error,
      currentVersion,
      history: revisions.map((row) => ({
        version: row.version,
        createdAt: row.createdAt.toISOString(),
      })),
      current,
    };
  } catch (error) {
    if (isMissingTable(error)) return emptyIndex(true, true);
    throw error;
  }
}

export async function readTicketCopilotRevision(
  db: PrismaClient,
  conversationId: string,
  version: number,
): Promise<CopilotRevisionView | null> {
  if (!isAiEnabled()) return null;
  try {
    return await loadRevisionView(db, conversationId, version);
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function loadRevisionView(
  db: PrismaClient,
  conversationId: string,
  version: number,
): Promise<CopilotRevisionView | null> {
  const revision = await db.aiTicketMemoryRevision.findFirst({
    where: { conversationId, version },
    select: {
      version: true,
      createdAt: true,
      summaryJson: true,
      interaction: {
        select: {
          status: true,
          citations: {
            orderBy: { rank: "asc" },
            select: {
              distance: true,
              pageNumber: true,
              documentId: true,
              chunk: { select: { content: true, pageNumber: true } },
            },
          },
          draftMessage: { select: { id: true, body: true, sendStatus: true } },
        },
      },
    },
  });
  if (!revision) return null;
  const citations = revision.interaction?.citations ?? [];
  const documentIds = [...new Set(citations.flatMap((row) => (row.documentId ? [row.documentId] : [])))];
  const documents = documentIds.length
    ? await db.officeDocument.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, title: true, storageKey: true, kind: true, contentRevision: true, ingestStatus: true },
      })
    : [];
  const officeIds = new Set(documents.map((row) => row.id));
  const systemIds = documentIds.filter((id) => !officeIds.has(id));
  const systemDocuments = systemIds.length
    ? await db.systemDocument.findMany({
        where: { id: { in: systemIds } },
        select: { id: true, title: true, storageKey: true, ingestStatus: true },
      })
    : [];
  const byId = new Map<
    string,
    { title: string; storageKey: string; kind: string | null; contentRevision: number | null; ingestStatus: string }
  >([
    ...documents.map((row) => [row.id, row] as const),
    ...systemDocuments.map((row) => [row.id, { ...row, kind: null, contentRevision: null }] as const),
  ]);
  return buildCopilotRevisionView({
    version: revision.version,
    createdAt: revision.createdAt,
    status: revision.interaction?.status ?? null,
    summaryJson: revision.summaryJson,
    citations: citations.map((row) => {
      const document = row.documentId ? byId.get(row.documentId) : undefined;
      return {
        distance: row.distance,
        pageNumber: row.pageNumber ?? row.chunk.pageNumber,
        documentTitle: document?.title ?? null,
        storageKey: document?.storageKey ?? null,
        content: row.chunk.content,
        kind: document?.kind ?? null,
        contentRevision: document?.contentRevision ?? null,
        ingestStatus: document?.ingestStatus ?? null,
      };
    }),
    draft: revision.interaction?.draftMessage
      ? {
          id: revision.interaction.draftMessage.id,
          body: revision.interaction.draftMessage.body,
          sendStatus: revision.interaction.draftMessage.sendStatus,
        }
      : null,
  });
}

export async function readTicketAiAudit(db: PrismaClient, ticketId: string) {
  if (!isAiEnabled()) return { enabled: false as const, events: [], tokensToday: 0 };
  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [events, tokensAgg] = await Promise.all([
      db.aiAuditEvent.findMany({
        where: { ticketId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, action: true, result: true, createdAt: true },
      }),
      db.aiInteraction.aggregate({
        where: { ticketId, createdAt: { gte: start } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ]);
    const tokensToday = (tokensAgg._sum.inputTokens ?? 0) + (tokensAgg._sum.outputTokens ?? 0);
    return { enabled: true as const, events, tokensToday };
  } catch (error) {
    if (isMissingTable(error)) return { enabled: true as const, events: [], tokensToday: 0 };
    throw error;
  }
}
