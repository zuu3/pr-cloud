import { notFound } from "next/navigation";
import Link from "next/link";
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
    <main className="mx-auto max-w-[860px] px-6 py-8 sm:py-10">
      <Link href="/" className="text-[13px] text-muted hover:text-body">
        ← 보관함
      </Link>

      <h1 className="mt-3 text-[26px] font-bold leading-[1.35] tracking-[-0.01em] text-foreground">
        {video.title}
      </h1>
      <p className="mt-1.5 text-[13px] text-muted">
        {humanSize(video.sizeBytes == null ? null : Number(video.sizeBytes))} ·{" "}
        {new Date(video.createdAt).toLocaleString("ko-KR")}
        {video.uploadedBy ? ` · ${video.uploadedBy}` : ""}
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border">
        <VideoPlayer videoId={video.id} />
      </div>

      {video.description && (
        <p className="mt-5 whitespace-pre-wrap text-[15px] leading-[1.7] text-body">
          {video.description}
        </p>
      )}

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
