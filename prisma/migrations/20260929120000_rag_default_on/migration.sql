-- Busca da IA ligada por padrão. Áudio continua fora (sem texto para consultar).
ALTER TABLE "OfficeDocument" ALTER COLUMN "ragEnabled" SET DEFAULT true;

UPDATE "OfficeDocument"
SET "ragEnabled" = true
WHERE "ragEnabled" = false
  AND "kind" <> 'audio'
  AND lower("mime") NOT LIKE 'audio/%';
