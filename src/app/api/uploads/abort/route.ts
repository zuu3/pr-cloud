import { z } from "zod";
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";

const schema = z.object({ key: z.string(), uploadId: z.string() });

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const { videoId } = await assertUploadOwner(b.data.key, b.data.uploadId, user.email);
    // Aborting an upload RGW already dropped (NoSuchUpload) is still "aborted".
    await s3Internal
      .send(
        new AbortMultipartUploadCommand({
          Bucket: BUCKET,
          Key: b.data.key,
          UploadId: b.data.uploadId,
        }),
      )
      .catch((e) => {
        console.warn("abort: S3 said", (e as Error)?.name);
      });
    await prisma.$transaction([
      prisma.video.update({ where: { id: videoId }, data: { status: "failed" } }),
      prisma.upload.delete({ where: { videoId } }),
    ]);
    return json({ ok: true });
  });
}
