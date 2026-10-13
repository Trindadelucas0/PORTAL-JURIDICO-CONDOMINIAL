export type CitationInput = { chunkId: string; documentId?: string | null; pageNumber?: number | null; distance?: number | null };

export type MedidaInput = { oQueFazer: string; avaliacao: string; chunkId: string | null };

/** Citation cujo chunk não veio no pacote desta execução é descartada. */
export function keepCitations<T extends { chunkId: string }>(citations: T[], allowedChunkIds: ReadonlySet<string>): T[] {
  return citations.filter((row) => allowedChunkIds.has(row.chunkId));
}

/** Medida sem ação sai. Chunk que não passou em keepCitations perde o trecho. Teto 6. */
export function keepMedidas(medidas: MedidaInput[] | undefined, allowedChunkIds: ReadonlySet<string>): MedidaInput[] {
  if (!medidas?.length) return [];
  const kept: MedidaInput[] = [];
  for (const row of medidas) {
    const oQueFazer = row.oQueFazer.trim();
    if (!oQueFazer) continue;
    const rawId = row.chunkId?.trim() || null;
    kept.push({
      oQueFazer: oQueFazer.slice(0, 500),
      avaliacao: row.avaliacao.trim().slice(0, 800),
      chunkId: rawId && allowedChunkIds.has(rawId) ? rawId : null,
    });
    if (kept.length >= 6) break;
  }
  return kept;
}
