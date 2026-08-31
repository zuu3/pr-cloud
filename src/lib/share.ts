import { prisma } from "./db";

/** true if the share link can't serve its video anymore */
export function shareLinkDead(link: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  video: { status: string; deletedAt: Date | null };
}): boolean {
  return (
    link.revokedAt !== null ||
    (link.expiresAt !== null && link.expiresAt < new Date()) ||
    link.video.status !== "ready" ||
    link.video.deletedAt !== null
  );
}

export async function resolveShare(token: string): Promise<{ title: string } | null> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { video: true },
  });
  if (!link || shareLinkDead(link)) return null;
  return { title: link.video.title };
}
