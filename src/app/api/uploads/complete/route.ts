import { z } from "zod";
import { CompleteMultipartUploadCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  key: z.string(),
  uploadId: z.string(),
  parts: z
    .array(z.object({ partNumber: z.number().int().positive(), etag: z.string() }))
    .min(1),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const { videoId } = await assertUploadOwner(b.data.key, b.data.uploadId, user.email);

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

    const head = await s3Internal.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: b.data.key }),
    );
    const [updated] = await prisma.$transaction([
      prisma.video.update({
        where: { id: videoId },
        data: { status: "ready", sizeBytes: BigInt(head.ContentLength ?? 0) },
      }),
      prisma.upload.delete({ where: { videoId } }),
    ]);
    await logAudit(user.email, "upload", videoId);
    return json({ video: { ...updated, sizeBytes: Number(updated.sizeBytes) } });
  });
}
