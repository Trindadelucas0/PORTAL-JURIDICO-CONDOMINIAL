-- Job manual do Atendimento guarda { messageIds } das mensagens marcadas. Linhas antigas ficam nulas.
ALTER TABLE "AiJob" ADD COLUMN "payload" JSONB;
