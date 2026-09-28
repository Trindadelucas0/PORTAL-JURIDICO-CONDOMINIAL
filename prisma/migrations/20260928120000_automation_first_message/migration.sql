-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('first_message_of_day');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('reserved', 'sent', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "automated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AuditEvent" ALTER COLUMN "actorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "skipActiveTicket" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "businessDate" VARCHAR(10) NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL,
    "reason" TEXT,
    "inboundMessageId" UUID NOT NULL,
    "outboundMessageId" UUID,
    "errorCode" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRule_trigger_key" ON "AutomationRule"("trigger");

-- CreateIndex
CREATE INDEX "AutomationExecution_createdAt_idx" ON "AutomationExecution"("createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_ruleId_status_idx" ON "AutomationExecution"("ruleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationExecution_ruleId_contactId_businessDate_key" ON "AutomationExecution"("ruleId", "contactId", "businessDate");

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AutomationRule" (
    "id",
    "nome",
    "trigger",
    "ativo",
    "body",
    "startsAt",
    "endsAt",
    "skipActiveTicket",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    'Primeira mensagem do dia',
    'first_message_of_day',
    false,
    'Olá, {{nome}}! Recebemos sua mensagem. Nossa equipe irá atendê-lo em breve. Obrigado pelo contato.',
    '08:00',
    '18:00',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "AutomationRule" WHERE "trigger" = 'first_message_of_day'
);
