-- Alias LID (+999…) da conversa. Não é telefone. Permanece depois de promover peerPhoneE164.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "peerLid" TEXT;

CREATE INDEX IF NOT EXISTS "Conversation_peerLid_idx" ON "Conversation"("peerLid");

UPDATE "Conversation"
SET "peerLid" = "peerPhoneE164"
WHERE "peerLid" IS NULL
  AND "peerPhoneE164" LIKE '+999%';
