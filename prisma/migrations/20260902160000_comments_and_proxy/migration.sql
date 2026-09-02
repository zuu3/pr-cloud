-- video proxy (h264 mp4 for non-web-playable sources)
ALTER TABLE "Video" ADD COLUMN "proxyKey" TEXT;

-- timestamped comments on a video
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "atSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_videoId_createdAt_idx" ON "Comment"("videoId", "createdAt");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_videoId_fkey"
    FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
