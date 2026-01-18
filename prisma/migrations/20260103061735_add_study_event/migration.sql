-- CreateEnum
CREATE TYPE "StudyItemType" AS ENUM ('VOCAB', 'SENTENCE');

-- CreateTable
CREATE TABLE "StudyEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StudyItemType" NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "itemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyEvent_userId_createdAt_idx" ON "StudyEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StudyEvent_type_createdAt_idx" ON "StudyEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "StudyEvent" ADD CONSTRAINT "StudyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
