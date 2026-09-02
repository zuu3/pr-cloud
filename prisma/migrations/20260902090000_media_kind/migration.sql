-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('video', 'image');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "kind" "MediaKind" NOT NULL DEFAULT 'video';
