import { RETRIEVAL_DISTANCE_LIMIT } from "@/lib/ai/confidence";
import { isAiRagEnabled } from "@/lib/ai/flags";
import { createAiProviderFromEnv } from "@/lib/ai/provider";

export type RetrievalChunk = {
  id: string;
  condominiumId: string | null;
  corpus: string;
  active: boolean;
  content: string;
  distance?: number | null;
  documentId?: string | null;
  pageNumber?: number | null;
  title?: string | null;
  kind?: string | null;
  contentRevision?: number | null;
  ingestStatus?: string | null;
  clientSendable?: boolean;
};

export type RagMotivo =
  | "rag_desligado"
  | "sem_condominio"
  | "sem_consulta"
  | "embedding_indisponivel"
  | "nenhum_chunk"
  | "similaridade_abaixo_limite"
  | "concluido";

export type RetrievalResult = {
  chunks: RetrievalChunk[];
  motivo: RagMotivo;
  candidatos: number;
};

/**
 * O id sugerido pelo modelo é ignorado. O filtro usa o condominiumId da conversa.
 */
export function chunksVisibleToConversation<T extends RetrievalChunk>(
  rows: T[],
  conversationCondominiumId: string,
  modelSuggestedCondominiumId?: string | null,
): T[] {
  void modelSuggestedCondominiumId;
  return rows
    .filter(
      (row) =>
        row.condominiumId === conversationCondominiumId &&
        row.active &&
        row.corpus === "condominium" &&
        (row.distance == null || row.distance <= RETRIEVAL_DISTANCE_LIMIT),
    )
    .slice(0, 5);
}

type ChunkRow = {
  id: string;
  condominiumId: string | null;
  corpus: string;
  active: boolean;
  content: string;
  officeDocumentId: string | null;
  pageNumber: number | null;
  distance: number | string | null;
  documentTitle?: string | null;
  documentKind?: string | null;
  contentRevision?: number | null;
  ingestStatus?: string | null;
};

type ChunkDb = {
  conversation: {
    findFirst(args: {
      where: { id: string };
      select: { condominiumId: true };
    }): Promise<{ condominiumId: string | null } | null>;
  };
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<ChunkRow[]>;
};

export type EmbedQueryFn = (text: string) => Promise<number[] | null>;

function vectorLiteral(embedding: number[]): string | null {
  if (embedding.length !== 1536) return null;
  if (embedding.some((value) => !Number.isFinite(value))) return null;
  return `[${embedding.join(",")}]`;
}

function emptyResult(motivo: RagMotivo): RetrievalResult {
  return { chunks: [], motivo, candidatos: 0 };
}

function motivoDepoisDoFiltro(rows: RetrievalChunk[], visible: RetrievalChunk[], condominiumId: string): RagMotivo {
  if (visible.length > 0) return "concluido";
  if (rows.length === 0) return "nenhum_chunk";
  const mesmoCondo = rows.filter(
    (row) => row.condominiumId === condominiumId && row.active && row.corpus === "condominium",
  );
  const soDistancia =
    mesmoCondo.length > 0 && mesmoCondo.every((row) => row.distance != null && row.distance > RETRIEVAL_DISTANCE_LIMIT);
  return soDistancia ? "similaridade_abaixo_limite" : "nenhum_chunk";
}

function mapRow(row: ChunkRow): RetrievalChunk {
  const title = row.documentTitle?.trim() ? row.documentTitle.trim() : null;
  return {
    id: row.id,
    condominiumId: row.condominiumId,
    corpus: row.corpus,
    active: row.active,
    content: row.content,
    documentId: row.officeDocumentId,
    pageNumber: row.pageNumber,
    distance: row.distance == null ? null : Number(row.distance),
    title,
    kind: row.documentKind ?? null,
    contentRevision: typeof row.contentRevision === "number" ? row.contentRevision : null,
    ingestStatus: row.ingestStatus ?? null,
  };
}

async function defaultEmbedQuery(text: string): Promise<number[] | null> {
  const provider = createAiProviderFromEnv();
  if (!provider) return null;
  const vectors = await provider.embed({
    texts: [text.slice(0, 4000)],
    model: process.env.AI_MODEL_EMBED?.trim() || "embed",
    timeoutMs: 25000,
    inputType: "query",
  });
  return vectors[0] ?? null;
}

export async function retrieveForConversation(
  db: ChunkDb,
  conversationId: string,
  modelSuggestedCondominiumId?: string | null,
  queryText?: string | null,
  embedQuery: EmbedQueryFn = defaultEmbedQuery,
): Promise<RetrievalResult> {
  if (!isAiRagEnabled()) return emptyResult("rag_desligado");
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId },
    select: { condominiumId: true },
  });
  if (!conversation?.condominiumId) return emptyResult("sem_condominio");
  const trimmed = queryText?.trim();
  if (!trimmed) return emptyResult("sem_consulta");
  const embedding = await embedQuery(trimmed);
  if (!embedding) return emptyResult("embedding_indisponivel");
  const literal = vectorLiteral(embedding);
  if (!literal) return emptyResult("embedding_indisponivel");
  const condoId = conversation.condominiumId;
  const rows = await db.$queryRaw`
    SELECT
      c.id,
      c."condominiumId",
      c.corpus,
      c.active,
      c.content,
      c."officeDocumentId",
      c."pageNumber",
      (c.embedding <=> ${literal}::vector) AS distance,
      d.title AS "documentTitle",
      d.kind::text AS "documentKind",
      d."contentRevision",
      d."ingestStatus"::text AS "ingestStatus"
    FROM "DocumentChunk" c
    LEFT JOIN "OfficeDocument" d ON d.id = c."officeDocumentId"
    WHERE c."condominiumId" = ${condoId}::uuid
      AND c.active = true
      AND c.corpus = 'condominium'
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT 5
  `;
  const mapped = rows.map(mapRow);
  const visible = chunksVisibleToConversation(mapped, conversation.condominiumId, modelSuggestedCondominiumId);
  return {
    chunks: visible,
    motivo: motivoDepoisDoFiltro(mapped, visible, conversation.condominiumId),
    candidatos: rows.length,
  };
}
