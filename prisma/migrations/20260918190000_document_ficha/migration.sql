-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM (
  'convencao',
  'regimento',
  'ata_assembleia',
  'edital',
  'contrato',
  'procuracao',
  'parecer',
  'notificacao',
  'correspondencia',
  'evidencia',
  'audio',
  'outro'
);

-- AlterTable: add columns nullable first for backfill
ALTER TABLE "OfficeDocument" ADD COLUMN "kind" "DocumentKind";
ALTER TABLE "OfficeDocument" ADD COLUMN "title" TEXT;
ALTER TABLE "OfficeDocument" ADD COLUMN "purpose" TEXT;
ALTER TABLE "OfficeDocument" ADD COLUMN "notes" TEXT;

-- Backfill existing rows
UPDATE "OfficeDocument"
SET
  "kind" = 'outro',
  "title" = "originalName",
  "purpose" = 'Arquivo enviado antes da ficha.'
WHERE "kind" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "OfficeDocument" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "OfficeDocument" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "OfficeDocument" ALTER COLUMN "purpose" SET NOT NULL;

-- CreateIndex
CREATE INDEX "OfficeDocument_condominiumId_kind_idx" ON "OfficeDocument"("condominiumId", "kind");
