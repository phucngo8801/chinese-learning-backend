/*
  Warnings:

  - Added the required column `updatedAt` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE');

-- AlterTable
ALTER TABLE "ChatMessage"
ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- CreateTable
CREATE TABLE "ChatMessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessageReaction_messageId_createdAt_idx"
ON "ChatMessageReaction"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessageReaction_userId_createdAt_idx"
ON "ChatMessageReaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageReaction_messageId_userId_emoji_key"
ON "ChatMessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_createdAt_idx"
ON "ChatMessage"("senderId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessageReaction"
ADD CONSTRAINT "ChatMessageReaction_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageReaction"
ADD CONSTRAINT "ChatMessageReaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
