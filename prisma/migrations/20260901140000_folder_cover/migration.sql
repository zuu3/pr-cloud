-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "coverVideoId" TEXT;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_coverVideoId_fkey" FOREIGN KEY ("coverVideoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;
