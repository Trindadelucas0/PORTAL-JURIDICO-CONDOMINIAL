-- Opt-in de busca. Linhas já gravadas permanecem ragEnabled = false.
ALTER TABLE "OfficeDocument" ADD COLUMN "ragEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OfficeDocument" ADD COLUMN "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "OfficeDocument" ADD COLUMN "effectiveUntil" TIMESTAMP(3);
ALTER TABLE "OfficeDocument" ADD COLUMN "ragPriority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OfficeDocument" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OfficeDocument" ADD COLUMN "supersedesDocumentId" UUID;

ALTER TABLE "OfficeDocument"
  ADD CONSTRAINT "OfficeDocument_supersedesDocumentId_fkey"
  FOREIGN KEY ("supersedesDocumentId") REFERENCES "OfficeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OfficeDocument_ragEnabled_condominiumId_idx" ON "OfficeDocument"("condominiumId", "ragEnabled");

CREATE TABLE "AiCondominiumRule" (
  "id" UUID NOT NULL,
  "condominiumId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCondominiumRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCondominiumRule_condominiumId_version_key" ON "AiCondominiumRule"("condominiumId", "version");
CREATE INDEX "AiCondominiumRule_condominiumId_version_idx" ON "AiCondominiumRule"("condominiumId", "version");

ALTER TABLE "AiCondominiumRule"
  ADD CONSTRAINT "AiCondominiumRule_condominiumId_fkey"
  FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
