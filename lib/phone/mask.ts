import { normalizeE164 } from "@/lib/phone/e164";
import { isLidPeer, isOrphanPeer } from "@/lib/phone/identity";

/** Digits only; strips LID/orphan placeholders from input masks. */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Progressive BR mask for inputs.
 * Accepts national 10/11 digits or full +55…; never formats LID placeholders as phones.
 */
export function formatPhoneInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (isLidPeer(trimmed) || isOrphanPeer(trimmed)) return "";

  let digits = phoneDigitsOnly(trimmed);
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(0, 13);
  } else if (!digits.startsWith("55")) {
    digits = digits.slice(0, 11);
  }

  const national =
    digits.startsWith("55") && digits.length >= 4 ? digits.slice(2) : digits.startsWith("55") ? "" : digits;

  if (!national) {
    return digits.startsWith("55") ? "+55" : "";
  }

  const ddd = national.slice(0, 2);
  let local = national.slice(2);

  if (local.length === 8 && local[0] >= "6" && local[0] <= "9") {
    local = `9${local}`;
  }
  local = local.slice(0, 9);

  if (national.length <= 2) {
    return `+55 (${ddd}`;
  }
  if (local.length <= 4) {
    return `+55 (${ddd}) ${local}`;
  }
  if (local.length <= 5) {
    return `+55 (${ddd}) ${local}`;
  }
  return `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
}

/** Masked or raw input → E.164, or null if invalid / LID. */
export function toE164FromMasked(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isLidPeer(trimmed) || isOrphanPeer(trimmed)) return null;
  const normalized = normalizeE164(trimmed);
  if (!normalized || isLidPeer(normalized) || isOrphanPeer(normalized)) return null;
  return normalized;
}

/** Display value for an E.164 (or empty) inside PhoneInput. */
export function e164ToMaskedInput(e164?: string | null): string {
  if (!e164) return "";
  if (isLidPeer(e164) || isOrphanPeer(e164)) return "";
  return formatPhoneInput(e164);
}
