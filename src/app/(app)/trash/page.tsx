import { BackLink } from "@/components/back-link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { folderPath } from "@/lib/folders";
import { TrashList } from "@/components/trash-list";

export default async function TrashPage() {
  const user = await requireUser();
  const [rows, folders] = await Promise.all([
    prisma.video.findMany({
      where: {
        status: "ready",
        deletedAt: { not: null },
        ...(user.role === "admin" ? {} : { uploadedBy: user.email }),
      },
      orderBy: { deletedAt: "desc" },
      select: { id: true, title: true, sizeBytes: true, createdAt: true, folderId: true },
      take: 200,
    }),
    prisma.folder.findMany({ select: { id: true, name: true, parentId: true } }),
  ]);

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 sm:py-12">
      <BackLink />
      <h1 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-foreground">휴지통</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-body">
        삭제한 영상은 여기 있어요. 되살리거나 완전히 지울 수 있어요.
      </p>
      <TrashList
        initial={rows.map((r) => ({
          id: r.id,
          title: r.title,
          sizeBytes: r.sizeBytes == null ? null : Number(r.sizeBytes),
          createdAt: r.createdAt.toISOString(),
          path: r.folderId ? folderPath(folders, r.folderId) : null,
        }))}
      />
    </main>
  );
}
