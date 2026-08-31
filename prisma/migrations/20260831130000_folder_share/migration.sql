-- AlterTable
ALTER TABLE "ShareLink" ALTER COLUMN "videoId" DROP NOT NULL;
ALTER TABLE "ShareLink" ADD COLUMN "folderId" TEXT;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
