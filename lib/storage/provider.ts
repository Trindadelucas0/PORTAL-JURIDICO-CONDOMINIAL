export type StoredFile = {
  storageKey: string;
  mime: string;
  sizeBytes: number;
  originalName: string;
};

export interface StorageProvider {
  save(buffer: Buffer, originalName: string, mime: string): Promise<StoredFile>;
  read(storageKey: string): Promise<{ buffer: Buffer; mime?: string }>;
}

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg; codecs=opus",
]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "arquivo";
}

export function isAllowedMime(mime: string) {
  const base = mime.split(";")[0]?.trim().toLowerCase() || "";
  if (base === "image/svg+xml" || base === "text/html") return false;
  return ALLOWED_MIME.has(base) || ALLOWED_MIME.has(mime.toLowerCase());
}
