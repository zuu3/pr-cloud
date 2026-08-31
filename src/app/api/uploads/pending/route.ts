import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { reconcileStuckUploads } from "@/lib/reconcile";

/**
 * The caller's uploads that never reached "ready" — so kids can see the ones
 * that quietly died instead of asking "올렸는데 사라졌어요?". Reconciles their
 * own stuck uploads first (bounded, cheap).
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await reconcileStuckUploads({ email: user.email }).catch(() => {});

    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const uploads = await prisma.video.findMany({
      where: {
        uploadedBy: user.email,
        status: { in: ["pending", "uploading", "failed"] },
        createdAt: { gt: weekAgo },
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, status: true, createdAt: true, folderId: true },
    });
    return json({ uploads });
  });
}

/** Discard one dead upload row (nothing to restore — the bytes never landed). */
export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id required");

    const v = await prisma.video.findUnique({ where: { id }, include: { upload: true } });
    if (!v) throw new HttpError(404, "not found");
    if (v.uploadedBy !== user.email) throw new HttpError(403, "not your upload");
    if (v.status === "ready") throw new HttpError(409, "already uploaded");

    if (v.upload) {
      await s3Internal
        .send(
          new AbortMultipartUploadCommand({
            Bucket: BUCKET,
            Key: v.s3Key,
            UploadId: v.upload.s3UploadId,
          }),
        )
        .catch(() => {});
    }
    await prisma.video.delete({ where: { id } });
    return json({ ok: true });
  });
}
