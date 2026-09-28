export type CitationInput = { chunkId: string; documentId?: string | null; pageNumber?: number | null; distance?: number | null };

/** Citation cujo chunk não veio no pacote desta execução é descartada. */
export function keepCitations<T extends { chunkId: string }>(citations: T[], allowedChunkIds: ReadonlySet<string>): T[] {
  return citations.filter((row) => allowedChunkIds.has(row.chunkId));
}
