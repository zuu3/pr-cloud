import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const renameSchema = z.object({ name: z.string().min(1).max(20) });

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const b = renameSchema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new HttpError(404, "not found");
    const updated = await prisma.folder.update({
      where: { id },
      data: { name: b.data.name },
      select: { id: true, name: true, parentId: true },
    });
    await logAudit(user.email, "folder.rename", id);
    return json({ folder: updated });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new HttpError(404, "not found");
    const [childCount, videoCount] = await Promise.all([
      prisma.folder.count({ where: { parentId: id } }),
      prisma.video.count({ where: { folderId: id } }),
    ]);
    if (childCount > 0 || videoCount > 0) {
      throw new HttpError(409, "폴더를 비운 뒤 삭제할 수 있어요");
    }
    await prisma.folder.delete({ where: { id } });
    await logAudit(user.email, "folder.delete", id);
    return new Response(null, { status: 204 });
  });
}
