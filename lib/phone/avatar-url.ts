/** Public app path for a stored avatar key (session-gated via /api/files). */
export function peerAvatarPublicUrl(storageKey?: string | null): string | null {
  if (!storageKey || storageKey.includes("..")) return null;
  return `/api/files/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}
