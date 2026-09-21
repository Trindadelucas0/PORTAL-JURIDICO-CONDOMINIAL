-- AlterTable
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "avatarKey" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "peerAvatarKey" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "peerAvatarFetchedAt" TIMESTAMP(3);
