-- CreateTable
CREATE TABLE "DailyGate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "vocabId" INTEGER,
    "phraseZh" TEXT NOT NULL,
    "phrasePinyin" TEXT NOT NULL,
    "phraseVi" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 80,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "passedAt" TIMESTAMP(3),
    "lastTranscript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyGate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyGate_userId_dateKey_key" ON "DailyGate"("userId", "dateKey");
CREATE INDEX "DailyGate_userId_passedAt_idx" ON "DailyGate"("userId", "passedAt");

-- AddForeignKey
ALTER TABLE "DailyGate" ADD CONSTRAINT "DailyGate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyGate" ADD CONSTRAINT "DailyGate_vocabId_fkey" FOREIGN KEY ("vocabId") REFERENCES "Vocab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
