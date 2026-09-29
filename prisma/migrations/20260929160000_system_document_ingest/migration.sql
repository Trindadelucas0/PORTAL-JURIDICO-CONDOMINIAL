-- Documentos do sistema entram na busca da análise. Linhas antigas ficam stored, sem indexedAt.
ALTER TABLE "SystemDocument" ADD COLUMN "ingestStatus" "IngestStatus" NOT NULL DEFAULT 'stored';
ALTER TABLE "SystemDocument" ADD COLUMN "indexedAt" TIMESTAMP(3);
