/*
  Warnings:

  - You are about to drop the column `content` on the `ChatMessage` table. All the data in the column will be lost.
  - You are about to drop the column `isRead` on the `ChatMessage` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `RoomMessage` table. All the data in the column will be lost.
  - You are about to drop the column `settings` on the `UserSettings` table. All the data in the column will be lost.
  - Added the required column `text` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `text` to the `RoomMessage` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ChatMessage_receiverId_isRead_idx";

-- AlterTable
ALTER TABLE "ChatMessage" DROP COLUMN "content",
DROP COLUMN "isRead",
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "text" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RoomMessage" DROP COLUMN "content",
ADD COLUMN     "text" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN "settings",
ADD COLUMN     "onlyTingWhenNotOnChat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'light';

-- CreateIndex
CREATE INDEX "ChatMessage_receiverId_readAt_idx" ON "ChatMessage"("receiverId", "readAt");
