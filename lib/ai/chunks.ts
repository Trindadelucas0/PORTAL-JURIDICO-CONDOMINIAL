import { aiChunkChars, aiChunkOverlap } from "@/lib/ai/env";

export function chunkText(
  text: string,
  size = aiChunkChars(),
  overlap = aiChunkOverlap(),
): Array<{ index: number; content: string }> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: Array<{ index: number; content: string }> = [];
  let cursor = 0;
  let index = 0;
  while (cursor < clean.length) {
    chunks.push({ index, content: clean.slice(cursor, cursor + size) });
    if (cursor + size >= clean.length) break;
    cursor += Math.max(1, size - overlap);
    index += 1;
  }
  return chunks;
}

export function sniffDocument(buffer: Buffer): "pdf" | "jpeg" | "png" | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("utf8") === "%PDF") return "pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }
  return null;
}

/** Copia o condomínio do documento. Ignora id vindo de fora. */
export function chunkCondominiumId(documentCondominiumId: string, modelSuggestedCondominiumId?: string | null): string {
  void modelSuggestedCondominiumId;
  return documentCondominiumId;
}
