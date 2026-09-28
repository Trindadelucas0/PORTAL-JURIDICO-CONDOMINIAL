import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { notFound, unprocessable } from "@/lib/api/errors";

export const contactFactSchema = z.string().trim().min(1).max(200);

export function normalizeContactFacts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const parsed = contactFactSchema.safeParse(item);
    if (!parsed.success) continue;
    out.push(parsed.data);
    if (out.length >= 3) break;
  }
  return out;
}

export async function proposedContactFacts(
  db: PrismaClient,
  input: { contactId: string; facts: string[]; sourceInteractionId?: string | null },
) {
  if (!input.facts.length) return;
  await db.aiContactMemory.createMany({
    data: input.facts.map((fact) => ({
      contactId: input.contactId,
      fact,
      sourceInteractionId: input.sourceInteractionId ?? null,
      confidence: "baixa",
      status: "proposed",
    })),
  });
}

export async function acceptedFactsForContact(db: PrismaClient, contactId: string | null | undefined) {
  if (!contactId) return [];
  const rows = await db.aiContactMemory.findMany({
    where: { contactId, status: "accepted" },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { fact: true },
  });
  return rows.map((row) => row.fact);
}

export async function listContactMemory(db: PrismaClient, contactId: string) {
  const contact = await db.contact.findFirst({ where: { id: contactId }, select: { id: true } });
  if (!contact) throw notFound("Contato não encontrado");
  return db.aiContactMemory.findMany({
    where: { contactId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export const memoryStatusSchema = z.enum(["accepted", "rejected"]);

export async function patchContactMemory(
  db: PrismaClient,
  contactId: string,
  memoryId: string,
  status: z.infer<typeof memoryStatusSchema>,
) {
  const row = await db.aiContactMemory.findFirst({ where: { id: memoryId, contactId } });
  if (!row) throw notFound("Fato não encontrado");
  if (row.status !== "proposed" && row.status !== status) {
    throw unprocessable("Só fatos propostos podem mudar de status");
  }
  return db.aiContactMemory.update({
    where: { id: row.id },
    data: { status },
  });
}
