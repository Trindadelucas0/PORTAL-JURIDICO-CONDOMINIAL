import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export function interactionKey(messageIds: string[]): string {
  return createHash("sha256").update([...messageIds].sort().join("\n")).digest("hex");
}

/** A revisão vN+1 só entra se a corrente ainda for N. */
export function versionMatches(current: number, expected: number): boolean {
  return current === expected;
}

export function nextMemoryVersion(current: number): number {
  return current + 1;
}

export async function advanceMemoryPointer(
  db: Db,
  conversationId: string,
  expectedVersion: number,
  ticketId: string | null,
): Promise<boolean> {
  if (expectedVersion === 0) {
    try {
      await db.aiTicketMemory.create({
        data: { conversationId, ticketId, version: 1 },
      });
      return true;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code === "P2002") return false;
      throw error;
    }
  }
  const updated = await db.aiTicketMemory.updateMany({
    where: { conversationId, version: expectedVersion },
    data: { version: expectedVersion + 1, ticketId },
  });
  return updated.count === 1;
}
