export type IndexEnqueueInput = {
  documentId: string;
  storageKey: string;
};

export type IndexEnqueueResult = {
  queued: false;
  reason: "noop";
};

/**
 * Ponto único para um job de índice futuro (RAG). Nesta entrega é no-op:
 * não gera embedding, não escreve DocumentChunk, não chama LLM.
 */
export interface DocumentIndexPort {
  enqueue(input: IndexEnqueueInput): Promise<IndexEnqueueResult>;
}

export const noopDocumentIndex: DocumentIndexPort = {
  async enqueue(_input: IndexEnqueueInput): Promise<IndexEnqueueResult> {
    void _input;
    return { queued: false, reason: "noop" };
  },
};
