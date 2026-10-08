import { formatPhoneInput } from "@/lib/phone/mask";
import { isLidPeer, isOrphanPeer } from "@/lib/phone/identity";

export const WHATSAPP_HIDDEN_NUMBER_LABEL = "Número não informado pelo WhatsApp";

/** Shared BR display (+55 + optional 9th digit). Prefer formatPhoneInput for forms. */
export function formatBrazilNational(digits: string): string {
  const withCc = digits.startsWith("55") ? digits : `55${digits}`;
  return formatPhoneInput(`+${withCc}`) || `+${withCc}`;
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
  return formatWhatsAppPeer(peerPhone || contactPhone);
}

/** Nome operacional da thread: cadastro → pushName → telefone → rótulo curto (nunca o parágrafo LID). */
export function conversationIdentityLabel(row: {
  contact?: { nome?: string | null; phoneE164?: string | null } | null;
  peerDisplayName?: string | null;
  peerPhoneE164?: string | null;
}): string {
  const nome = row.contact?.nome?.trim();
  if (nome) return nome;
  const push = row.peerDisplayName?.trim();
  if (push) return push;
  const phone = conversationPhoneLabel(row.contact?.phoneE164, row.peerPhoneE164);
  if (phone !== WHATSAPP_HIDDEN_NUMBER_LABEL && phone !== "—") return phone;
  return "Contato WhatsApp";
}
