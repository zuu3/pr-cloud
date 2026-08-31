import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["trash", "restore", "move", "purge"]),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const { ids, action, folderId } = b.data;

    const scope =
      user.role === "admin" ? { id: { in: ids } } : { id: { in: ids }, uploadedBy: user.email };
    const videos = await prisma.video.findMany({ where: scope });
    if (videos.length === 0) return json({ count: 0 });
    const okIds = videos.map((v) => v.id);

    if (action === "move") {
      if (folderId) {
        const f = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!f) throw new HttpError(400, "folder not found");
      }
      await prisma.video.updateMany({ where: { id: { in: okIds } }, data: { folderId: folderId ?? null } });
    } else if (action === "trash") {
      await prisma.video.updateMany({ where: { id: { in: okIds } }, data: { deletedAt: new Date() } });
    } else if (action === "restore") {
      await prisma.video.updateMany({ where: { id: { in: okIds } }, data: { deletedAt: null } });
    } else if (action === "purge") {
      for (const v of videos) {
        for (const key of [v.s3Key, v.thumbKey].filter(Boolean) as string[]) {
          await s3Internal.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
        }
      }
      await prisma.video.deleteMany({ where: { id: { in: okIds } } });
    }

    await logAudit(user.email, `video.bulk.${action}`, okIds.join(","));
    return json({ count: okIds.length });
  });
}
