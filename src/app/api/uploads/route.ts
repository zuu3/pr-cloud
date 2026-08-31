import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { makeVideoKey } from "@/lib/keys";
import { needsMultipart, extOf } from "@/lib/uploads";
import { signPutUrl } from "@/lib/s3";
import { assertRate } from "@/lib/ratelimit";

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
    assertRate(`upload:${user.email}`, 600, 60_000);
    const body = schema.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "invalid body");
    const d = body.data;

    if (needsMultipart(d.size)) {
      return json({ error: "use multipart", multipart: true }, 400);
    }

    const key = makeVideoKey(extOf(d.originalFilename));
    const video = await prisma.video.create({
      data: {
        title: d.title,
        description: d.description,
        folderId: d.folderId ?? null,
        s3Key: key,
        sizeBytes: BigInt(d.size),
        contentType: d.contentType,
        originalFilename: d.originalFilename,
        status: "pending",
        uploadedBy: user.email,
      },
    });
    const url = await signPutUrl(key, d.contentType);
    return json({ videoId: video.id, key, url }, 201);
  });
}
