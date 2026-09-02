CREATE TABLE "Favorite" (
    "userEmail" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userEmail", "videoId")
);

CREATE INDEX "Favorite_userEmail_idx" ON "Favorite"("userEmail");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_videoId_fkey"
    FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
