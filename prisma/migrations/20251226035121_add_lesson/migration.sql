-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "hskLevel" INTEGER NOT NULL,
    "vi" TEXT NOT NULL,
    "zh" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);
