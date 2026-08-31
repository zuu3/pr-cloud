import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const moveSchema = z.object({ folderId: z.string().uuid().nullable() });

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const b = moveSchema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) throw new HttpError(404, "not found");
    if (user.role !== "admin" && video.uploadedBy !== user.email) {
      throw new HttpError(403, "forbidden");
    }
    if (b.data.folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: b.data.folderId } });
      if (!folder) throw new HttpError(400, "folder not found");
    }
    const updated = await prisma.video.update({
      where: { id },
      data: { folderId: b.data.folderId },
      select: { id: true, folderId: true },
    });
    await logAudit(user.email, "video.move", id);
    return json({ video: updated });
  });
}

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
