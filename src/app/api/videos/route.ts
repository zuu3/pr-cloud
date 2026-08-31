import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { signGetUrl } from "@/lib/s3";
import type { Prisma } from "@prisma/client";

type SortKey = "new" | "old" | "title" | "size";

const orderBy: Record<SortKey, Prisma.VideoOrderByWithRelationInput[]> = {
  new: [{ createdAt: "desc" }, { id: "desc" }],
  old: [{ createdAt: "asc" }, { id: "asc" }],
  title: [{ title: "asc" }, { id: "asc" }],
  size: [{ sizeBytes: "desc" }, { id: "desc" }],
};

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const p = new URL(request.url).searchParams;
    const trash = p.get("trash") === "1";
    const folderParam = p.get("folderId");
    const q = p.get("q")?.trim();
    const cursor = p.get("cursor");
    const sort = (p.get("sort") ?? "new") as SortKey;

    const where: Prisma.VideoWhereInput = trash
      ? { status: "ready", deletedAt: { not: null } }
      : { status: "ready", deletedAt: null };

    if (trash) {
      if (user.role !== "admin") where.uploadedBy = user.email;
    } else if (folderParam !== "all") {
      where.folderId = folderParam ?? null;
    }
    if (q) where.title = { contains: q, mode: "insensitive" };

    const rows = await prisma.video.findMany({
      where,
      orderBy: orderBy[sort] ?? orderBy.new,
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        sizeBytes: true,
        contentType: true,
        originalFilename: true,
        durationSec: true,
        thumbKey: true,
        viewCount: true,
        createdAt: true,
        folderId: true,
      },
    });

    const nextCursor = rows.length > 50 ? rows[49].id : null;
    const videos = await Promise.all(
      rows.slice(0, 50).map(async (v) => ({
        ...v,
        sizeBytes: v.sizeBytes == null ? null : Number(v.sizeBytes),
        thumbUrl: v.thumbKey ? await signGetUrl(v.thumbKey, { disposition: "inline" }) : null,
        thumbKey: undefined,
      })),
    );
    return json({ videos, nextCursor });
  });
}
