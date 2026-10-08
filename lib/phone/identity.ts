import { normalizeE164 } from "@/lib/phone/e164";

/** Original first, then at most one Brazil mobile 8↔9 digit variant. */
export function brazilWhatsAppNumberVariants(digits: string): string[] {
  const number = digits.replace(/\D/g, "");
  const variants = [number];
  if (number.startsWith("55") && number.length === 13 && number[4] === "9") {
    variants.push(`${number.slice(0, 4)}${number.slice(5)}`);
  } else if (number.startsWith("55") && number.length === 12) {
    variants.push(`${number.slice(0, 4)}9${number.slice(4)}`);
  }
  return [...new Set(variants)].slice(0, 2);
}

export function isLidPeer(phone: string): boolean {
  return phone.startsWith("+999");
}

export function isOrphanPeer(phone: string): boolean {
  return phone.startsWith("+998");
}

export function e164LookupValues(phone: string): string[] {
  const normalized = normalizeE164(phone) || phone;
  if (isLidPeer(normalized) || isOrphanPeer(normalized)) return [normalized];
  const digits = normalized.replace(/\D/g, "");
  return brazilWhatsAppNumberVariants(digits).map((d) => `+${d}`);
}

export function uniquePhones(...values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.length > 0)))];
}

export function identityKind(value: string): "phone" | "lid" {
  return isLidPeer(value) ? "lid" : "phone";
}

function realWhatsAppPhone(value: string | null | undefined): string | null {
  if (!value || isLidPeer(value) || isOrphanPeer(value)) return null;
  return value;
}

/** Peer real desta mensagem. Telefone do contato só quando não há peer; LID e órfão não herdam o cadastro. */
export function sendableWhatsAppE164(input: {
  contactPhoneE164?: string | null;
  peerPhoneE164?: string | null;
}): string | null {
  const peer = input.peerPhoneE164?.trim() || null;
  const realPeer = realWhatsAppPhone(peer);
  if (realPeer) return realPeer;
  if (peer && (isLidPeer(peer) || isOrphanPeer(peer))) return null;
  return realWhatsAppPhone(input.contactPhoneE164);
}

/** Drawer "Puxar do WhatsApp": só com sessão Baileys open e telefone ainda não travado. */
export function canPullWhatsAppPhone(
  connectionStatus: string | null | undefined,
  phoneLocked: boolean,
): boolean {
  return connectionStatus === "open" && !phoneLocked;
}
