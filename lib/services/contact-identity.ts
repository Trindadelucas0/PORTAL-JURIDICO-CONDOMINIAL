import type { Contact, Prisma, PrismaClient } from "@prisma/client";
import { e164LookupValues, identityKind, uniquePhones } from "@/lib/phone/identity";

type Db = PrismaClient | Prisma.TransactionClient;

export async function upsertContactIdentities(db: Db, contactId: string, values: string[]) {
  for (const value of uniquePhones(...values)) {
    const existing = await db.contactIdentity.findUnique({ where: { value } });
    if (existing) {
      if (existing.contactId !== contactId) {
        await db.contactIdentity.update({
          where: { id: existing.id },
          data: { contactId, kind: identityKind(value) },
        });
      }
      continue;
    }
    try {
      await db.contactIdentity.create({
        data: { contactId, kind: identityKind(value), value },
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
      if (code !== "P2002") throw error;
    }
  }
}

export async function findContactByPhones(db: Db, phones: string[]): Promise<Contact | null> {
  const keys = uniquePhones(...phones.flatMap((p) => e164LookupValues(p)));
  if (!keys.length) return null;
  const contact = await db.contact.findFirst({
    where: { phoneE164: { in: keys }, deletedAt: null },
  });
  if (contact) return contact;
  const ident = await db.contactIdentity.findFirst({
    where: { value: { in: keys } },
    include: { contact: true },
  });
  if (ident?.contact && !ident.contact.deletedAt) return ident.contact;
  return null;
}
