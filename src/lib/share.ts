import { prisma } from "./db";
import { subtreeIds } from "./subtree";

/** true if the share link can't serve anything anymore */
export function shareLinkDead(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  video?: { status: string; deletedAt: Date | null } | null;
  folder?: { id: string } | null;
}): boolean {
  if (link.revokedAt !== null) return true;
  if (link.expiresAt !== null && link.expiresAt < new Date()) return true;
  if (link.video) return link.video.status !== "ready" || link.video.deletedAt !== null;
  if (link.folder) return false;
  return true; // neither target — dead
}

export type ShareVideo = {
  id: string;
  title: string;
  mediaKind: "video" | "image";
  durationSec: number | null;
  thumbKey: string | null;
  playableInBrowser: boolean | null;
};

export type ResolvedShare =
  | { kind: "video"; title: string; videoId: string; mediaKind: "video" | "image" }
  | { kind: "folder"; title: string; folderId: string; videos: ShareVideo[] };

export async function resolveShare(token: string): Promise<ResolvedShare | null> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { video: true, folder: true },
  });
  if (!link || shareLinkDead(link)) return null;

  if (link.video) {
    return {
      kind: "video",
      title: link.video.title,
      videoId: link.video.id,
      mediaKind: link.video.kind,
    };
  }
  if (link.folder) {
    const folders = await prisma.folder.findMany({
      select: { id: true, name: true, parentId: true },
    });
    const ids = subtreeIds(folders, link.folder.id);
    const videos = await prisma.video.findMany({
      where: { folderId: { in: ids }, status: "ready", deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        kind: true,
        durationSec: true,
        thumbKey: true,
        playableInBrowser: true,
      },
    });
    return {
      kind: "folder",
      title: link.folder.name,
      folderId: link.folder.id,
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        mediaKind: v.kind,
        durationSec: v.durationSec,
        thumbKey: v.thumbKey,
        playableInBrowser: v.playableInBrowser,
      })),
    };
  }
  return null;
}

/** A video is reachable through a folder-share token if it's in that subtree. */
export async function shareAllowsVideo(token: string, videoId: string): Promise<boolean> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { video: true, folder: true },
  });
  if (!link || shareLinkDead(link)) return false;
  if (link.video) return link.video.id === videoId;
  if (link.folder) {
    const folders = await prisma.folder.findMany({ select: { id: true, parentId: true } });
    const ids = new Set(subtreeIds(folders, link.folder.id));
    const v = await prisma.video.findUnique({ where: { id: videoId } });
    return !!v && v.status === "ready" && !v.deletedAt && !!v.folderId && ids.has(v.folderId);
  }
  return false;
}
