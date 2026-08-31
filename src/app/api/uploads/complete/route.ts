import { z } from "zod";
import { CompleteMultipartUploadCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";
import { generateMedia } from "@/lib/media";

const schema = z.object({
  key: z.string(),
  uploadId: z.string(),
  size: z.number().int().nonnegative().optional(),
  parts: z
    .array(z.object({ partNumber: z.number().int().positive(), etag: z.string() }))
    .min(1),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** RGW assembles the object a moment after CompleteMultipartUpload returns 200,
 *  so HeadObject can 403/404 briefly. Retry, then fall back to the reported size. */
async function headSizeWithRetry(key: string): Promise<number | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const h = await s3Internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      return Number(h.ContentLength ?? 0);
    } catch {
      await sleep(400 * (i + 1));
    }
  }
  return null;
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const { videoId } = await assertUploadOwner(b.data.key, b.data.uploadId, user.email);

    try {
      await s3Internal.send(
        new CompleteMultipartUploadCommand({
          Bucket: BUCKET,
          Key: b.data.key,
          UploadId: b.data.uploadId,
          MultipartUpload: {
            Parts: b.data.parts
              .slice()
              .sort((x, y) => x.partNumber - y.partNumber)
              .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      );
    } catch (e) {
      // RGW dropped the multipart upload (aborted / expired) or rejected the
      // part set — the object won't exist. Fail the row cleanly, no 500.
      const name = (e as Error)?.name ?? "";
      await prisma.$transaction([
        prisma.video.update({ where: { id: videoId }, data: { status: "failed" } }),
        prisma.upload.deleteMany({ where: { videoId } }),
      ]);
      console.warn("complete: CompleteMultipartUpload failed", name, (e as Error)?.message);
      throw new HttpError(
        409,
        name === "NoSuchUpload"
          ? "업로드 세션이 만료됐어요. 다시 올려 주세요."
          : "업로드를 마무리하지 못했어요. 다시 시도해 주세요.",
      );
    }

    // object is assembled; get its size (retry, else trust the client's number)
    const headSize = await headSizeWithRetry(b.data.key);
    const sizeBytes = headSize ?? b.data.size ?? null;

    const [updated] = await prisma.$transaction([
      prisma.video.update({
        where: { id: videoId },
        data: {
          status: "ready",
          sizeBytes: sizeBytes == null ? undefined : BigInt(sizeBytes),
        },
      }),
      prisma.upload.delete({ where: { videoId } }),
    ]);
    await logAudit(user.email, "upload", videoId);
    void generateMedia(videoId).catch(() => {});
    return json({
      video: { ...updated, sizeBytes: updated.sizeBytes == null ? null : Number(updated.sizeBytes) },
    });
  });
}
