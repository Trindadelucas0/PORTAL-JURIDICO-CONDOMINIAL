CREATE TABLE IF NOT EXISTS "SystemDocumentCategory" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemDocumentCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemDocumentCategory_nome_key" ON "SystemDocumentCategory"("nome");

CREATE TABLE IF NOT EXISTS "SystemDocument" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "whenToUse" TEXT NOT NULL,
    "searchHints" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemDocument_storageKey_key" ON "SystemDocument"("storageKey");
CREATE INDEX IF NOT EXISTS "SystemDocument_categoryId_idx" ON "SystemDocument"("categoryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SystemDocument_categoryId_fkey'
  ) THEN
    ALTER TABLE "SystemDocument"
      ADD CONSTRAINT "SystemDocument_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "SystemDocumentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SystemDocument_uploadedById_fkey'
  ) THEN
    ALTER TABLE "SystemDocument"
      ADD CONSTRAINT "SystemDocument_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON UPDATE CASCADE;
  END IF;
END $$;
