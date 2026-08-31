import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(request.url).searchParams;
    const folderParam = p.get("folderId");
    const q = p.get("q")?.trim();
    const cursor = p.get("cursor");

    const where: Prisma.VideoWhereInput = { status: "ready" };
    if (folderParam !== "all") where.folderId = folderParam ?? null;
    if (q) where.title = { contains: q, mode: "insensitive" };

    const rows = await prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        sizeBytes: true,
        contentType: true,
        originalFilename: true,
        createdAt: true,
        folderId: true,
      },
    });

    const nextCursor = rows.length > 50 ? rows[49].id : null;
    const videos = rows.slice(0, 50).map((v) => ({
      ...v,
      sizeBytes: v.sizeBytes == null ? null : Number(v.sizeBytes),
    }));
    return json({ videos, nextCursor });
  });
}
