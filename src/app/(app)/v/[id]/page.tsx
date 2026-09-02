import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { humanSize, humanDuration } from "@/lib/format";
import { signGetUrl } from "@/lib/s3";
import { VideoPlayer } from "@/components/video-player";
import { VideoActions } from "@/components/video-actions";
import { SharePanel } from "@/components/share-panel";
import { MoveToFolder } from "@/components/move-to-folder";
import { EditableMeta } from "@/components/editable-meta";
import { DetailNav } from "@/components/detail-nav";
import { Comments } from "@/components/comments";

export default async function VideoDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.status !== "ready" || video.deletedAt) notFound();

  const canManage = user.role === "admin" || video.uploadedBy === user.email;
  const [folders, parentFolder, siblings] = await Promise.all([
    canManage
      ? prisma.folder.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, parentId: true },
        })
      : Promise.resolve([]),
    video.folderId
      ? prisma.folder.findUnique({ where: { id: video.folderId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.video.findMany({
      where: { folderId: video.folderId ?? null, status: "ready", deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
  ]);
  const idx = siblings.findIndex((s) => s.id === video.id);
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;

  const backHref = video.folderId ? `/?folderId=${video.folderId}` : "/";
  const backLabel = parentFolder?.name ?? "보관함";
  const isImage = video.kind === "image";
  const poster = video.thumbKey ? `/api/thumb/${video.id}` : null;
  // hand the player a ready-to-use URL so playback starts without an extra RTT
  const playbackUrl =
    !isImage && video.playableInBrowser === false
      ? null
      : await signGetUrl(video.proxyKey ?? video.s3Key, { disposition: "inline" });
  // a visit counts as a view
  void prisma.video
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

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
      <BackLink href={backHref}>{backLabel}</BackLink>

      <EditableMeta
        videoId={video.id}
        title={video.title}
        description={video.description}
        canEdit={canManage}
      />
      <p className="mt-1.5 text-[13px] text-muted">{meta}</p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-black">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playbackUrl ?? poster ?? ""}
            alt={video.title}
            className="mx-auto max-h-[75vh] w-full object-contain"
          />
        ) : (
          <VideoPlayer
            videoId={video.id}
            poster={poster}
            playable={video.playableInBrowser}
            initialUrl={playbackUrl}
          />
        )}
      </div>

      <DetailNav prevId={prevId} nextId={nextId} />

      <VideoActions videoId={video.id} canManage={canManage} />

      {canManage && (
        <div className="mt-8 rounded-2xl border border-border bg-canvas p-5">
          <MoveToFolder videoId={video.id} folders={folders} current={video.folderId} />
          <SharePanel videoId={video.id} />
        </div>
      )}

      <Comments
        videoId={video.id}
        me={user.email}
        canModerate={user.role === "admin"}
        isImage={isImage}
      />
    </main>
  );
}
