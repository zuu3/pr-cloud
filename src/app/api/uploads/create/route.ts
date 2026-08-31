import { z } from "zod";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { makeVideoKey } from "@/lib/keys";
import { extOf, PART_SIZE } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  folderId: z.string().uuid().optional(),
  originalFilename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const d = b.data;

    const key = makeVideoKey(extOf(d.originalFilename));
    const mpu = await s3Internal.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: d.contentType }),
    );
    if (!mpu.UploadId) throw new HttpError(502, "no upload id from S3");

    const video = await prisma.video.create({
      data: {
        title: d.title,
        description: d.description,
        folderId: d.folderId ?? null,
        s3Key: key,
        sizeBytes: BigInt(d.size),
        contentType: d.contentType,
        originalFilename: d.originalFilename,
        status: "uploading",
        uploadedBy: user.email,
        upload: { create: { s3UploadId: mpu.UploadId, partSize: PART_SIZE } },
      },
    });
    return json({ videoId: video.id, key, uploadId: mpu.UploadId, partSize: PART_SIZE }, 201);
  });
}
