/*
  Warnings:

  - You are about to drop the column `receiverId` on the `Friend` table. All the data in the column will be lost.
  - You are about to drop the column `senderId` on the `Friend` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Friend` table. All the data in the column will be lost.
  - Added the required column `friendId` to the `Friend` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Friend` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Friend" DROP CONSTRAINT "Friend_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "Friend" DROP CONSTRAINT "Friend_senderId_fkey";

-- AlterTable
ALTER TABLE "Friend" DROP COLUMN "receiverId",
DROP COLUMN "senderId",
DROP COLUMN "status",
ADD COLUMN     "friendId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Streak" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "recoveryMonth" INTEGER NOT NULL DEFAULT 202501,
ADD COLUMN     "recoveryUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
