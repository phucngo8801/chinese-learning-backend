/*
  Warnings:

  - You are about to drop the `Room` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RoomInvite` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RoomMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RoomMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ChatConversationType" AS ENUM ('DM', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- DropForeignKey
ALTER TABLE "ChatConversation" DROP CONSTRAINT "ChatConversation_userAId_fkey";

-- DropForeignKey
ALTER TABLE "ChatConversation" DROP CONSTRAINT "ChatConversation_userBId_fkey";

-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "RoomInvite" DROP CONSTRAINT "RoomInvite_inviteeId_fkey";

-- DropForeignKey
ALTER TABLE "RoomInvite" DROP CONSTRAINT "RoomInvite_inviterId_fkey";

-- DropForeignKey
ALTER TABLE "RoomInvite" DROP CONSTRAINT "RoomInvite_roomId_fkey";

-- DropForeignKey
ALTER TABLE "RoomMember" DROP CONSTRAINT "RoomMember_roomId_fkey";

-- DropForeignKey
ALTER TABLE "RoomMember" DROP CONSTRAINT "RoomMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "RoomMessage" DROP CONSTRAINT "RoomMessage_roomId_fkey";

-- DropForeignKey
ALTER TABLE "RoomMessage" DROP CONSTRAINT "RoomMessage_senderId_fkey";

-- DropIndex
DROP INDEX "ChatConversation_userAId_idx";

-- DropIndex
DROP INDEX "ChatConversation_userBId_idx";

-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "type" "ChatConversationType" NOT NULL DEFAULT 'DM',
ALTER COLUMN "userAId" DROP NOT NULL,
ALTER COLUMN "userBId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ChatMessage" ALTER COLUMN "receiverId" DROP NOT NULL;

-- DropTable
DROP TABLE "Room";

-- DropTable
DROP TABLE "RoomInvite";

-- DropTable
DROP TABLE "RoomMember";

-- DropTable
DROP TABLE "RoomMessage";

-- DropEnum
DROP TYPE "RoomInviteStatus";

-- CreateTable
CREATE TABLE "ChatConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatMemberRole" NOT NULL DEFAULT 'MEMBER',
    "nickname" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ChatConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageHidden" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageHidden_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversationMember_userId_lastReadAt_idx" ON "ChatConversationMember"("userId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversationMember_conversationId_userId_key" ON "ChatConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessageHidden_userId_createdAt_idx" ON "ChatMessageHidden"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageHidden_userId_messageId_key" ON "ChatMessageHidden"("userId", "messageId");

-- CreateIndex
CREATE INDEX "ChatConversation_type_lastMessageAt_idx" ON "ChatConversation"("type", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "ChatConversationMember" ADD CONSTRAINT "ChatConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversationMember" ADD CONSTRAINT "ChatConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageHidden" ADD CONSTRAINT "ChatMessageHidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageHidden" ADD CONSTRAINT "ChatMessageHidden_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
