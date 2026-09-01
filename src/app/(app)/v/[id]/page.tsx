import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { humanSize, humanDuration } from "@/lib/format";
import { VideoPlayer } from "@/components/video-player";
import { VideoActions } from "@/components/video-actions";
import { SharePanel } from "@/components/share-panel";
import { MoveToFolder } from "@/components/move-to-folder";
import { EditableMeta } from "@/components/editable-meta";

export default async function VideoDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.status !== "ready" || video.deletedAt) notFound();

  const canManage = user.role === "admin" || video.uploadedBy === user.email;
  const folders = canManage
    ? await prisma.folder.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, parentId: true },
      })
    : [];
  const poster = video.thumbKey ? `/api/thumb/${video.id}` : null;

  const meta = [
    humanSize(video.sizeBytes == null ? null : Number(video.sizeBytes)),
    humanDuration(video.durationSec) || null,
    `조회 ${video.viewCount}`,
    new Date(video.createdAt).toLocaleDateString("ko-KR"),
    video.uploadedBy,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-[860px] px-4 sm:px-6 py-8 sm:py-10">
      <BackLink />

      <EditableMeta
        videoId={video.id}
        title={video.title}
        description={video.description}
        canEdit={canManage}
      />
      <p className="mt-1.5 text-[13px] text-muted">{meta}</p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border">
        <VideoPlayer
          videoId={video.id}
          poster={poster}
          playable={video.playableInBrowser}
        />
      </div>

      <VideoActions videoId={video.id} canManage={canManage} />

      {canManage && (
        <div className="mt-8 rounded-2xl border border-border bg-canvas p-5">
          <MoveToFolder videoId={video.id} folders={folders} current={video.folderId} />
          <SharePanel videoId={video.id} />
        </div>
      )}
    </main>
  );
}
