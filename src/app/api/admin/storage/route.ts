import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { env } from "@/lib/env";
import { folderPath } from "@/lib/folders";

const num = (b: bigint | null | undefined) => Number(b ?? 0n);

export async function GET() {
  return handle(async () => {
    await requireAdmin();

    const [live, trash, byUserRaw, byFolderRaw, folders] = await Promise.all([
      prisma.video.aggregate({
        _sum: { sizeBytes: true },
        _count: true,
        where: { deletedAt: null, status: "ready" },
      }),
      prisma.video.aggregate({
        _sum: { sizeBytes: true },
        _count: true,
        where: { deletedAt: { not: null } },
      }),
      prisma.video.groupBy({
        by: ["uploadedBy"],
        _sum: { sizeBytes: true },
        _count: { _all: true },
        where: { deletedAt: null, status: "ready" },
      }),
      prisma.video.groupBy({
        by: ["folderId"],
        _sum: { sizeBytes: true },
        _count: { _all: true },
        where: { deletedAt: null, status: "ready" },
      }),
      prisma.folder.findMany({ select: { id: true, name: true, parentId: true } }),
    ]);

    const byUser = byUserRaw
      .map((r) => ({
        email: r.uploadedBy ?? "(알 수 없음)",
        bytes: num(r._sum.sizeBytes),
        count: r._count._all,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10);

    const byFolder = byFolderRaw
      .map((r) => ({
        folder: r.folderId ? folderPath(folders, r.folderId) : "루트",
        bytes: num(r._sum.sizeBytes),
        count: r._count._all,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10);

    return json({
      totalBytes: num(live._sum.sizeBytes),
      totalCount: live._count,
      trashBytes: num(trash._sum.sizeBytes),
      trashCount: trash._count,
      quota: env.STORAGE_QUOTA_BYTES ?? null,
      byUser,
      byFolder,
    });
  });
}
