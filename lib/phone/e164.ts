export function normalizeE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    if (rest.length < 10 || rest.length > 15) return null;
    return `+${rest}`;
  }
  const only = digits.replace(/\D/g, "");
  if (only.length === 11 || only.length === 10) return `+55${only}`;
  if (only.length >= 12 && only.length <= 15) return `+${only}`;
  return null;
}
