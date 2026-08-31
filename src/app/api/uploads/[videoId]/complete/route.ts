import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";
import { generateMedia } from "@/lib/media";

type Ctx = { params: Promise<{ videoId: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { videoId } = await params;

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new HttpError(404, "video not found");
    if (video.uploadedBy !== user.email) throw new HttpError(403, "not your upload");

    try {
      const head = await s3Internal.send(
        new HeadObjectCommand({ Bucket: BUCKET, Key: video.s3Key }),
      );
      const updated = await prisma.video.update({
        where: { id: videoId },
        data: { status: "ready", sizeBytes: BigInt(head.ContentLength ?? 0) },
      });
      await logAudit(user.email, "upload", videoId);
      void generateMedia(videoId).catch(() => {});
      return json({
        video: { ...updated, sizeBytes: Number(updated.sizeBytes) },
      });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      await prisma.video.update({ where: { id: videoId }, data: { status: "failed" } });
      throw new HttpError(409, "object not found");
    }
  });
}
