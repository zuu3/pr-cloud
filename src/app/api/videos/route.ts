import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import type { Prisma } from "@prisma/client";

type SortKey = "new" | "old" | "title" | "size" | "views";

const orderBy: Record<SortKey, Prisma.VideoOrderByWithRelationInput[]> = {
  new: [{ createdAt: "desc" }, { id: "desc" }],
  old: [{ createdAt: "asc" }, { id: "asc" }],
  title: [{ title: "asc" }, { id: "asc" }],
  size: [{ sizeBytes: "desc" }, { id: "desc" }],
  views: [{ viewCount: "desc" }, { id: "desc" }],
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
    const mine = p.get("mine") === "1";
    const days = Number(p.get("days"));
    const kind = p.get("kind");

    const where: Prisma.VideoWhereInput = trash
      ? { status: "ready", deletedAt: { not: null } }
      : { status: "ready", deletedAt: null };

    if (trash) {
      if (user.role !== "admin") where.uploadedBy = user.email;
    } else if (folderParam !== "all") {
      where.folderId = folderParam ?? null;
    }
    if (q) where.title = { contains: q, mode: "insensitive" };
    if (!trash && mine) where.uploadedBy = user.email;
    if (!trash && Number.isFinite(days) && days > 0) {
      where.createdAt = { gte: new Date(Date.now() - days * 86_400_000) };
    }
    if (kind === "video" || kind === "image") where.kind = kind;

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
        kind: true,
        durationSec: true,
        thumbKey: true,
        playableInBrowser: true,
        viewCount: true,
        createdAt: true,
        folderId: true,
      },
    });

    const nextCursor = rows.length > 50 ? rows[49].id : null;
    const videos = rows.slice(0, 50).map((v) => ({
      ...v,
      sizeBytes: v.sizeBytes == null ? null : Number(v.sizeBytes),
      thumbUrl: v.thumbKey ? `/api/thumb/${v.id}` : null,
      thumbKey: undefined,
    }));
    return json({ videos, nextCursor });
  });
}
