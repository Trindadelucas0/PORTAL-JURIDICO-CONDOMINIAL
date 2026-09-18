import { isLidPeer, isOrphanPeer } from "@/lib/phone/identity";

export const WHATSAPP_HIDDEN_NUMBER_LABEL = "Número não informado pelo WhatsApp";

function formatBrazilNational(digits: string): string {
  const ddd = digits.slice(2, 4);
  let local = digits.slice(4);
  if (local.length === 8 && local[0] >= "6" && local[0] <= "9") {
    local = `9${local}`;
  }
  if (local.length === 9) {
    return `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
  }
  if (local.length === 8) {
    return `+55 (${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  }
  return `+${digits}`;
}

/** Rótulo para UI: LID/placeholder nunca aparece como se fosse telefone. */
export function formatWhatsAppPeer(phone?: string | null): string {
  if (!phone) return "—";
  if (isLidPeer(phone) || isOrphanPeer(phone)) return WHATSAPP_HIDDEN_NUMBER_LABEL;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return formatBrazilNational(digits);
  }
  return phone.startsWith("+") ? phone : `+${digits || phone}`;
}

export function conversationPhoneLabel(contactPhone?: string | null, peerPhone?: string | null): string {
  return formatWhatsAppPeer(contactPhone || peerPhone);
}
