-- CreateEnum
CREATE TYPE "BadgeCode" AS ENUM ('STREAK_3', 'STREAK_7', 'STREAK_30', 'MINUTES_60', 'NO_RECOVERY_7');

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "code" "BadgeCode" NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_userId_key" ON "Badge"("code", "userId");

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
