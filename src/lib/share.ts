import { prisma } from "./db";

export async function resolveShare(token: string): Promise<{ title: string } | null> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { video: true },
  });
  if (!link || link.revokedAt !== null) return null;
  if (link.expiresAt !== null && link.expiresAt < new Date()) return null;
  if (link.video.status !== "ready") return null;
  return { title: link.video.title };
}
