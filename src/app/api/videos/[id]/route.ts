import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    folderId: z.string().uuid().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty patch" });

async function ownedVideo(id: string, user: { email: string; role: string }) {
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) throw new HttpError(404, "not found");
  if (user.role !== "admin" && video.uploadedBy !== user.email) {
    throw new HttpError(403, "forbidden");
  }
  return video;
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const b = patchSchema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    await ownedVideo(id, user);

    if (b.data.folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: b.data.folderId } });
      if (!folder) throw new HttpError(400, "folder not found");
    }

    const updated = await prisma.video.update({
      where: { id },
      data: {
        ...(b.data.title !== undefined ? { title: b.data.title } : {}),
        ...(b.data.description !== undefined ? { description: b.data.description } : {}),
        ...(b.data.folderId !== undefined ? { folderId: b.data.folderId } : {}),
      },
      select: { id: true, title: true, description: true, folderId: true },
    });
    await logAudit(user.email, b.data.folderId !== undefined ? "video.move" : "video.edit", id);
    return json({ video: updated });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const purge = new URL(request.url).searchParams.get("purge") === "1";
    const video = await ownedVideo(id, user);

    if (!purge) {
      await prisma.video.update({ where: { id }, data: { deletedAt: new Date() } });
      await logAudit(user.email, "video.trash", id);
      return new Response(null, { status: 204 });
    }

    for (const key of [video.s3Key, video.thumbKey].filter(Boolean) as string[]) {
      await s3Internal.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
    }
    await prisma.video.delete({ where: { id } });
    await logAudit(user.email, "video.purge", id);
    return new Response(null, { status: 204 });
  });
}

export async function POST(request: Request, { params }: Ctx) {
  // restore from trash
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (new URL(request.url).searchParams.get("action") !== "restore") {
      throw new HttpError(400, "unknown action");
    }
    await ownedVideo(id, user);
    await prisma.video.update({ where: { id }, data: { deletedAt: null } });
    await logAudit(user.email, "video.restore", id);
    return json({ ok: true });
  });
}
