export type StoredFile = {
  storageKey: string;
  mime: string;
  sizeBytes: number;
  originalName: string;
};

export type SaveOptions = {
  officeDocument?: boolean;
};

export interface StorageProvider {
  save(buffer: Buffer, originalName: string, mime: string, options?: SaveOptions): Promise<StoredFile>;
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
  "text/markdown",
]);

/** Aceito só na ficha de documento do escritório. Anexo de WhatsApp continua recusando. */
const OFFICE_DOCUMENT_ONLY_MIME = new Set(["text/markdown"]);

/** Tipos que o navegador costuma mandar para um arquivo .md. */
const MARKDOWN_BROWSER_MIME = new Set(["", "application/octet-stream", "text/plain", "text/x-markdown"]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const OFFICE_DOCUMENT_MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

export function maxUploadBytes(options: SaveOptions = {}) {
  return options.officeDocument ? OFFICE_DOCUMENT_MAX_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "arquivo";
}

function baseMime(mime: string) {
  return mime.split(";")[0]?.trim().toLowerCase() || "";
}

export function isAllowedMime(mime: string, options: SaveOptions = {}) {
  const base = baseMime(mime);
  if (base === "image/svg+xml" || base === "text/html") return false;
  if (OFFICE_DOCUMENT_ONLY_MIME.has(base) && !options.officeDocument) return false;
  return ALLOWED_MIME.has(base) || ALLOWED_MIME.has(mime.toLowerCase());
}

export function isMarkdownFile(name: string, mime: string) {
  const base = baseMime(mime);
  if (base === "text/markdown") return true;
  return name.toLowerCase().endsWith(".md") && MARKDOWN_BROWSER_MIME.has(base);
}

/** Assinatura do arquivo. `null` = tipo sem magic bytes conhecido (ex. MP3, WebM, markdown). */
export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "OggS") return "audio/ogg";
  return null;
}

export function mimeMatchesSniff(declaredMime: string, sniffed: string | null) {
  if (!sniffed) return true;
  return baseMime(declaredMime) === sniffed;
}
