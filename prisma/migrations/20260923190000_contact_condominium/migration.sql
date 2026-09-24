-- Contato pode participar de vários condomínios; Contact.condominiumId continua o principal.
CREATE TABLE IF NOT EXISTS "ContactCondominium" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "condominiumId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactCondominium_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactCondominium_contactId_condominiumId_key"
  ON "ContactCondominium"("contactId", "condominiumId");

CREATE INDEX IF NOT EXISTS "ContactCondominium_contactId_idx" ON "ContactCondominium"("contactId");

CREATE INDEX IF NOT EXISTS "ContactCondominium_condominiumId_idx" ON "ContactCondominium"("condominiumId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactCondominium_contactId_fkey'
  ) THEN
    ALTER TABLE "ContactCondominium"
      ADD CONSTRAINT "ContactCondominium_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactCondominium_condominiumId_fkey'
  ) THEN
    ALTER TABLE "ContactCondominium"
      ADD CONSTRAINT "ContactCondominium_condominiumId_fkey"
      FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "ContactCondominium" ("id", "contactId", "condominiumId", "createdAt")
SELECT gen_random_uuid(), c."id", c."condominiumId", CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."condominiumId" IS NOT NULL
  AND c."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ContactCondominium" m
    WHERE m."contactId" = c."id" AND m."condominiumId" = c."condominiumId"
  );
