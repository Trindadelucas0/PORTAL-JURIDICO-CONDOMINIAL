export const INBOUND_DEBOUNCE_MS = 6000;
export const INBOUND_QUEUE = "ai-inbound";

export type InboundJobData = { conversationId: string };

export class MemoryJobQueue {
  private jobs = new Map<string, { name: string; data: InboundJobData; runAt: number }>();

  add(name: string, data: InboundJobData, opts: { jobId: string; delay: number }): { duplicated: boolean } {
    if (this.jobs.has(opts.jobId)) return { duplicated: true };
    this.jobs.set(opts.jobId, { name, data, runAt: Date.now() + opts.delay });
    return { duplicated: false };
  }

  size(): number {
    return this.jobs.size;
  }

  take(jobId: string): InboundJobData | null {
    const row = this.jobs.get(jobId);
    if (!row) return null;
    this.jobs.delete(jobId);
    return row.data;
  }
}

const memoryQueue = new MemoryJobQueue();

export function inboundJobId(conversationId: string): string {
  return `conv:${conversationId}`;
}

export function getMemoryJobQueue(): MemoryJobQueue {
  return memoryQueue;
}

export async function wakeInbound(conversationId: string): Promise<{ duplicated: boolean; mode: "memory" | "redis" }> {
  const url = process.env.JURICON_REDIS_URL?.trim();
  const jobId = inboundJobId(conversationId);
  if (!url) {
    const result = memoryQueue.add(INBOUND_QUEUE, { conversationId }, { jobId, delay: INBOUND_DEBOUNCE_MS });
    return { duplicated: result.duplicated, mode: "memory" };
  }
  const { Queue } = await import("bullmq");
  const queue = new Queue(INBOUND_QUEUE, {
    connection: {
      url,
      password: process.env.JURICON_REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    },
    prefix: "juricon",
  });
  try {
    await queue.add(
      "ai.inbound",
      { conversationId },
      {
        jobId,
        delay: INBOUND_DEBOUNCE_MS,
        attempts: 3,
        removeOnComplete: 100,
        backoff: { type: "exponential", delay: 10000 },
      },
    );
    return { duplicated: false, mode: "redis" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/already exists|JobId/i.test(message)) return { duplicated: true, mode: "redis" };
    throw error;
  } finally {
    await queue.close();
  }
}
