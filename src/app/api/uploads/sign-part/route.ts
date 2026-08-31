import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { signUploadPartUrl } from "@/lib/s3";

const schema = z.object({
  key: z.string(),
  uploadId: z.string(),
  partNumber: z.number().int().positive(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    await assertUploadOwner(b.data.key, b.data.uploadId, user.email);
    const url = await signUploadPartUrl(b.data.key, b.data.uploadId, b.data.partNumber);
    return json({ url }, 201);
  });
}
