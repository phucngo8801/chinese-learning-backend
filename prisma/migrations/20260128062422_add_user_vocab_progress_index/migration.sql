/*
  Warnings:

  - You are about to drop the column `failCount` on the `DailyGate` table. All the data in the column will be lost.
  - You are about to drop the column `skipUsed` on the `DailyGate` table. All the data in the column will be lost.
  - You are about to drop the column `skippedAt` on the `DailyGate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DailyGate" DROP COLUMN "failCount",
DROP COLUMN "skipUsed",
DROP COLUMN "skippedAt";

-- CreateIndex
CREATE INDEX "UserVocabProgress_userId_nextReview_idx" ON "UserVocabProgress"("userId", "nextReview");
