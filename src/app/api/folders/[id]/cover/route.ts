import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { s3Internal, BUCKET, signGetUrl } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const MAX = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// stable cover URL for a custom-uploaded folder image (302 -> presigned GET)
export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const { id } = await params;
    const f = await prisma.folder.findUnique({ where: { id }, select: { coverImageKey: true } });
    if (!f?.coverImageKey) return new Response("Not found", { status: 404 });
    const url = await signGetUrl(f.coverImageKey, { disposition: "inline" });
    return new Response(null, {
      status: 302,
      headers: { location: url, "cache-control": "private, max-age=3600" },
    });
  });
}

export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new HttpError(404, "not found");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "file required");
    const ext = EXT[file.type];
    if (!ext) throw new HttpError(400, "이미지 파일만 올릴 수 있어요 (jpg/png/webp/gif)");
    if (file.size > MAX) throw new HttpError(400, "이미지는 5MB 이하여야 해요");

    const key = `promo-video/folder-cover/${id}-${Date.now()}.${ext}`;
    await s3Internal.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      }),
    );

    const prev = folder.coverImageKey;
    await prisma.folder.update({
      where: { id },
      data: { coverImageKey: key, coverVideoId: null },
    });
    if (prev && prev !== key) {
      await s3Internal.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: prev })).catch(() => {});
    }
    await logAudit(user.email, "folder.cover", id);
    return json({ ok: true });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new HttpError(404, "not found");
    if (folder.coverImageKey) {
      await s3Internal
        .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: folder.coverImageKey }))
        .catch(() => {});
      await prisma.folder.update({ where: { id }, data: { coverImageKey: null } });
      await logAudit(user.email, "folder.cover", id);
    }
    return json({ ok: true });
  });
}
