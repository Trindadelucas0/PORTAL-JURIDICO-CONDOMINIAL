-- AlterEnum
CREATE TYPE "ContactIdentityKind" AS ENUM ('phone', 'lid');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "peerPhoneE164" TEXT;

UPDATE "Conversation" AS c
SET "peerPhoneE164" = ct."phoneE164"
FROM "Contact" AS ct
WHERE c."contactId" = ct.id
  AND c."peerPhoneE164" IS NULL;

UPDATE "Conversation"
SET "peerPhoneE164" = '+998' || RIGHT(REPLACE(id::text, '-', ''), 12)
WHERE "peerPhoneE164" IS NULL;

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "connectionId", "peerPhoneE164"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Conversation"
)
UPDATE "Conversation" AS c
SET "peerPhoneE164" = '+998' || RIGHT(REPLACE(c.id::text, '-', ''), 12)
FROM ranked AS r
WHERE c.id = r.id AND r.rn > 1;

ALTER TABLE "Conversation" ALTER COLUMN "peerPhoneE164" SET NOT NULL;

CREATE UNIQUE INDEX "Conversation_connectionId_peerPhoneE164_key" ON "Conversation"("connectionId", "peerPhoneE164");
CREATE INDEX "Conversation_peerPhoneE164_idx" ON "Conversation"("peerPhoneE164");

CREATE TABLE "ContactIdentity" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "kind" "ContactIdentityKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactIdentity_value_key" ON "ContactIdentity"("value");
CREATE INDEX "ContactIdentity_contactId_idx" ON "ContactIdentity"("contactId");

ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ContactIdentity" ("id", "contactId", "kind", "value")
SELECT gen_random_uuid(), id, 'phone', "phoneE164"
FROM "Contact"
ON CONFLICT ("value") DO NOTHING;
