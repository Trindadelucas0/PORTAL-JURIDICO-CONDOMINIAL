-- Fila independente do fuso da sessão: runAfter/lockedAt passam a timestamptz (UTC).
-- Linhas existentes são lidas como UTC naive (gravação Prisma).
ALTER TABLE "AiJob"
  ALTER COLUMN "runAfter" TYPE TIMESTAMPTZ(3) USING "runAfter" AT TIME ZONE 'UTC',
  ALTER COLUMN "lockedAt" TYPE TIMESTAMPTZ(3) USING "lockedAt" AT TIME ZONE 'UTC';

-- PDF sem texto (escaneado) e ingestão que não gerou chunk.
ALTER TYPE "IngestStatus" ADD VALUE 'failed';
