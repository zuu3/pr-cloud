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
    name: z.string().min(1).max(20).optional(),
    coverVideoId: z.string().uuid().nullable().optional(),
  })
  .refine((o) => o.name !== undefined || o.coverVideoId !== undefined, {
    message: "empty patch",
  });

/** this folder + every descendant folder id */
async function subtreeIds(rootId: string): Promise<string[]> {
  const all = await prisma.folder.findMany({ select: { id: true, parentId: true } });
  const childrenOf = new Map<string, string[]>();
  for (const f of all) {
    if (f.parentId) (childrenOf.get(f.parentId) ?? childrenOf.set(f.parentId, []).get(f.parentId)!).push(f.id);
  }
  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    ids.push(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return ids;
}

export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const { id } = await params;
    const folder = await prisma.folder.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!folder) throw new HttpError(404, "not found");
    const ids = await subtreeIds(id);
    const [videoCount] = await Promise.all([
      prisma.video.count({ where: { folderId: { in: ids }, deletedAt: null } }),
    ]);
    return json({ ...folder, subfolderCount: ids.length - 1, videoCount });
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const b = patchSchema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new HttpError(404, "not found");

    const data: { name?: string; coverVideoId?: string | null; coverImageKey?: string | null } = {};
    if (b.data.name !== undefined) data.name = b.data.name;

    if (b.data.coverVideoId !== undefined) {
      // picking a video (or clearing) also drops any uploaded cover image
      if (folder.coverImageKey) {
        await s3Internal
          .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: folder.coverImageKey }))
          .catch(() => {});
        data.coverImageKey = null;
      }
      if (b.data.coverVideoId === null) {
        data.coverVideoId = null; // back to auto
      } else {
        const ids = await subtreeIds(id);
        const v = await prisma.video.findFirst({
          where: {
            id: b.data.coverVideoId,
            folderId: { in: ids },
            deletedAt: null,
            status: "ready",
          },
          select: { id: true },
        });
        if (!v) throw new HttpError(400, "이 폴더 안의 영상이 아니에요");
        data.coverVideoId = v.id;
      }
    }

    const updated = await prisma.folder.update({
      where: { id },
      data,
      select: { id: true, name: true, parentId: true },
    });
    await logAudit(
      user.email,
      b.data.coverVideoId !== undefined ? "folder.cover" : "folder.rename",
      id,
    );
    return json({ folder: updated });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new HttpError(404, "not found");

    const ids = await subtreeIds(id);
    // trash every live video in the subtree, then drop the folders
    const trashed = await prisma.video.updateMany({
      where: { folderId: { in: ids }, deletedAt: null, status: "ready" },
      data: { deletedAt: new Date() },
    });
    await prisma.folder.delete({ where: { id } }); // cascades child folders; videos' folderId -> null

    await logAudit(
      user.email,
      "folder.delete",
      `${id} (folders:${ids.length}, videos:${trashed.count})`,
    );
    return json({ deletedFolders: ids.length, trashedVideos: trashed.count });
  });
}
