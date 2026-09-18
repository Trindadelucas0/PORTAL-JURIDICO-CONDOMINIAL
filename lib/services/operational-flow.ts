import type { Prisma } from "@prisma/client";
import { sendableWhatsAppE164 } from "@/lib/phone/identity";

export { sendableWhatsAppE164 };

/** Contato cadastrado com condomínio: entra no fluxo (triagem / chamado). */
export function isInOperationalFlow(contact: { condominiumId: string | null } | null | undefined): boolean {
  return Boolean(contact?.condominiumId);
}

export function conversationInOperationalFlow(row: {
  contactId: string | null;
  condominiumId: string | null;
}): boolean {
  return Boolean(row.contactId && row.condominiumId);
}

export const inFlowConversationWhere: Prisma.ConversationWhereInput = {
  AND: [{ contactId: { not: null } }, { condominiumId: { not: null } }],
};

export const outOfFlowConversationWhere: Prisma.ConversationWhereInput = {
  OR: [{ contactId: null }, { condominiumId: null }],
};
