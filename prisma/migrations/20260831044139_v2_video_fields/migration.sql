-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;
