-- DropIndex
DROP INDEX "Vocab_zh_idx";

-- AlterTable
ALTER TABLE "Vocab" ALTER COLUMN "level" DROP DEFAULT;
