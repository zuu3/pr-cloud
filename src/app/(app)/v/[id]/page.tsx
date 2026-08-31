import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { humanSize } from "@/lib/format";
import { VideoPlayer } from "@/components/video-player";
import { VideoActions } from "@/components/video-actions";
import { SharePanel } from "@/components/share-panel";
import { MoveToFolder } from "@/components/move-to-folder";

export default async function VideoDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.status !== "ready") notFound();

  const canManage = user.role === "admin" || video.uploadedBy === user.email;
  const folders = canManage
    ? await prisma.folder.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <main className="mx-auto max-w-[880px] px-6 py-8">
      <h2 className="text-[24px] font-semibold">{video.title}</h2>
      <p className="mt-1 text-[13px] text-muted">
        {humanSize(video.sizeBytes == null ? null : Number(video.sizeBytes))} ·{" "}
        {new Date(video.createdAt).toLocaleString("ko-KR")}
        {video.uploadedBy ? ` · ${video.uploadedBy}` : ""}
      </p>

      <div className="mt-4">
        <VideoPlayer videoId={video.id} />
      </div>

      {video.description && (
        <p className="mt-4 whitespace-pre-wrap text-[15px] text-body">{video.description}</p>
      )}

      <VideoActions videoId={video.id} canManage={canManage} />
      {canManage && (
        <div className="mt-4">
          <MoveToFolder videoId={video.id} folders={folders} current={video.folderId} />
        </div>
      )}
      {canManage && <SharePanel videoId={video.id} />}
    </main>
  );
}
