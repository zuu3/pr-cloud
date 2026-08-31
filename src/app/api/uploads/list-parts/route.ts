import { ListPartsCommand } from "@aws-sdk/client-s3";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const uploadId = url.searchParams.get("uploadId");
    if (!key || !uploadId) throw new HttpError(400, "key and uploadId required");
    await assertUploadOwner(key, uploadId, user.email);
    const out = await s3Internal.send(
      new ListPartsCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }),
    );
    const parts = (out.Parts ?? []).map((p) => ({
      partNumber: p.PartNumber,
      etag: p.ETag,
      size: p.Size,
    }));
    return json({ parts });
  });
}
