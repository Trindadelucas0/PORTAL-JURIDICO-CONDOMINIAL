-- Coleta inteligente. Sem backfill: conversas antigas ficam sem sessão (idle).
-- Message, AiJob e summaryJson não mudam.

CREATE TABLE "AiIntakeSession" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "nudgeSent" BOOLEAN NOT NULL DEFAULT false,
    "unclearCount" INTEGER NOT NULL DEFAULT 0,
    "lastQuestionMessageId" UUID,
    "lastQuestionAt" TIMESTAMP(3),
    "contextJson" JSONB,
    "closeReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AiIntakeSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiIntakeSession_conversationId_idx" ON "AiIntakeSession"("conversationId");

CREATE UNIQUE INDEX "AiIntakeSession_one_open_per_conversation"
ON "AiIntakeSession" ("conversationId")
WHERE "status" IN ('collecting', 'waiting_client', 'processing');

ALTER TABLE "AiIntakeSession"
ADD CONSTRAINT "AiIntakeSession_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
