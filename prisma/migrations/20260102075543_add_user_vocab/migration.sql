-- CreateTable
CREATE TABLE "UserVocab" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "vocabId" INTEGER NOT NULL,

    CONSTRAINT "UserVocab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserVocab_userId_vocabId_key" ON "UserVocab"("userId", "vocabId");

-- AddForeignKey
ALTER TABLE "UserVocab" ADD CONSTRAINT "UserVocab_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVocab" ADD CONSTRAINT "UserVocab_vocabId_fkey" FOREIGN KEY ("vocabId") REFERENCES "Vocab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
