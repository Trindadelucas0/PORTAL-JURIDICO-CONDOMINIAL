-- Camada de IA operacional. Aditiva: Message, Ticket e OfficeDocument já gravados permanecem.
-- clientSendable nasce false. Embedding só existe em DocumentChunk.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "OfficeDocument" ADD COLUMN "clientSendable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OfficeDocument" ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "officeDocumentId" UUID,
    "systemDocumentId" UUID,
    "condominiumId" UUID,
    "corpus" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(1536),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiJob" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "conversationId" UUID,
    "officeDocumentId" UUID,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "rerun" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiInteraction" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "ticketId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "riskLevel" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "draftMessageId" UUID,
    "analysisJson" JSONB,
    "contextVersion" TEXT NOT NULL DEFAULT 'inbound-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCitation" (
    "id" UUID NOT NULL,
    "interactionId" UUID NOT NULL,
    "chunkId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "distance" DOUBLE PRECISION,
    "documentId" UUID,
    "pageNumber" INTEGER,
    CONSTRAINT "AiCitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiTicketMemory" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "ticketId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiTicketMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiTicketMemoryRevision" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "ticketId" UUID,
    "version" INTEGER NOT NULL,
    "interactionId" UUID,
    "summaryJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiTicketMemoryRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiTicketMemoryMessage" (
    "revisionId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    CONSTRAINT "AiTicketMemoryMessage_pkey" PRIMARY KEY ("revisionId","messageId")
);

CREATE TABLE "AiTicketMemoryDocument" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "officeDocumentId" UUID NOT NULL,
    "pageNumber" INTEGER,
    CONSTRAINT "AiTicketMemoryDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiContactMemory" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "fact" TEXT NOT NULL,
    "sourceInteractionId" UUID,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiContactMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiAuditEvent" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "conversationId" UUID,
    "ticketId" UUID,
    "jobId" UUID,
    "interactionId" UUID,
    "actorId" UUID,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentChunk_officeDocumentId_contentHash_key" ON "DocumentChunk"("officeDocumentId", "contentHash");
CREATE UNIQUE INDEX "DocumentChunk_systemDocumentId_contentHash_key" ON "DocumentChunk"("systemDocumentId", "contentHash");
CREATE INDEX "DocumentChunk_condominiumId_active_idx" ON "DocumentChunk"("condominiumId", "active");
CREATE INDEX "DocumentChunk_systemDocumentId_idx" ON "DocumentChunk"("systemDocumentId");
CREATE INDEX "DocumentChunk_embedding_hnsw" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);

CREATE UNIQUE INDEX "AiJob_idempotencyKey_key" ON "AiJob"("idempotencyKey");
CREATE INDEX "AiJob_status_runAfter_idx" ON "AiJob"("status", "runAfter");
CREATE INDEX "AiJob_conversationId_idx" ON "AiJob"("conversationId");

CREATE UNIQUE INDEX "AiInteraction_idempotencyKey_key" ON "AiInteraction"("idempotencyKey");
CREATE UNIQUE INDEX "AiInteraction_draftMessageId_key" ON "AiInteraction"("draftMessageId");
CREATE INDEX "AiInteraction_conversationId_createdAt_idx" ON "AiInteraction"("conversationId", "createdAt");
CREATE INDEX "AiInteraction_ticketId_idx" ON "AiInteraction"("ticketId");

CREATE INDEX "AiCitation_interactionId_idx" ON "AiCitation"("interactionId");
CREATE INDEX "AiCitation_chunkId_idx" ON "AiCitation"("chunkId");

CREATE UNIQUE INDEX "AiTicketMemory_conversationId_key" ON "AiTicketMemory"("conversationId");

CREATE UNIQUE INDEX "AiTicketMemoryRevision_conversationId_version_key" ON "AiTicketMemoryRevision"("conversationId", "version");
CREATE INDEX "AiTicketMemoryRevision_ticketId_version_idx" ON "AiTicketMemoryRevision"("ticketId", "version");

CREATE INDEX "AiTicketMemoryDocument_revisionId_idx" ON "AiTicketMemoryDocument"("revisionId");
CREATE INDEX "AiContactMemory_contactId_status_idx" ON "AiContactMemory"("contactId", "status");

CREATE INDEX "AiAuditEvent_conversationId_createdAt_idx" ON "AiAuditEvent"("conversationId", "createdAt");
CREATE INDEX "AiAuditEvent_ticketId_createdAt_idx" ON "AiAuditEvent"("ticketId", "createdAt");
CREATE INDEX "AiAuditEvent_action_idx" ON "AiAuditEvent"("action");

ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_officeDocumentId_fkey" FOREIGN KEY ("officeDocumentId") REFERENCES "OfficeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_draftMessageId_fkey" FOREIGN KEY ("draftMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiCitation" ADD CONSTRAINT "AiCitation_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "AiInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCitation" ADD CONSTRAINT "AiCitation_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiTicketMemory" ADD CONSTRAINT "AiTicketMemory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTicketMemory" ADD CONSTRAINT "AiTicketMemory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiTicketMemoryRevision" ADD CONSTRAINT "AiTicketMemoryRevision_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTicketMemoryRevision" ADD CONSTRAINT "AiTicketMemoryRevision_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTicketMemoryRevision" ADD CONSTRAINT "AiTicketMemoryRevision_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "AiInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiTicketMemoryMessage" ADD CONSTRAINT "AiTicketMemoryMessage_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "AiTicketMemoryRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTicketMemoryMessage" ADD CONSTRAINT "AiTicketMemoryMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiTicketMemoryDocument" ADD CONSTRAINT "AiTicketMemoryDocument_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "AiTicketMemoryRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTicketMemoryDocument" ADD CONSTRAINT "AiTicketMemoryDocument_officeDocumentId_fkey" FOREIGN KEY ("officeDocumentId") REFERENCES "OfficeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiContactMemory" ADD CONSTRAINT "AiContactMemory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiAuditEvent" ADD CONSTRAINT "AiAuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiAuditEvent" ADD CONSTRAINT "AiAuditEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAuditEvent" ADD CONSTRAINT "AiAuditEvent_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "AiInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAuditEvent" ADD CONSTRAINT "AiAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
