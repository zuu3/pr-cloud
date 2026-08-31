import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) throw new HttpError(404, "not found");
    if (user.role !== "admin" && video.uploadedBy !== user.email) {
      throw new HttpError(403, "forbidden");
    }

    await s3Internal
      .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: video.s3Key }))
      .catch(() => {});
    await prisma.video.delete({ where: { id } });
    await logAudit(user.email, "delete", id);
    return new Response(null, { status: 204 });
  });
}
