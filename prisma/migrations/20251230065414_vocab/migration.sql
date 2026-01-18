/*
  Warnings:

  - The primary key for the `Lesson` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Lesson` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "Vocab" (
    "id" SERIAL NOT NULL,
    "zh" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL,
    "vi" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Vocab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vocab_zh_idx" ON "Vocab"("zh");
