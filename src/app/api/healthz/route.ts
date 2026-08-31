import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { s3Internal, BUCKET } from "@/lib/s3";
import { json } from "@/lib/http";

export async function GET() {
  const dbOk = await prisma
    .$queryRaw`SELECT 1`.then(() => true)
    .catch(() => false);
  const s3Ok = await s3Internal
    .send(new HeadBucketCommand({ Bucket: BUCKET }))
    .then(() => true)
    .catch(() => false);

  if (dbOk && s3Ok) return json({ ok: true });
  return json({ ok: false, db: dbOk, s3: s3Ok }, 503);
}
