import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ expiresAt: z.string().datetime().optional() });

async function manageableVideo(id: string, user: { email: string; role: string }) {
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.deletedAt) throw new HttpError(404, "not found");
  if (user.role !== "admin" && video.uploadedBy !== user.email) {
    throw new HttpError(403, "forbidden");
  }
  return video;
}

export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await manageableVideo(id, user);
    const rows = await prisma.shareLink.findMany({
      where: { videoId: id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });
    const links = rows.map((r) => ({
      id: r.id,
      url: `${env.NEXTAUTH_URL}/s/${r.token}`,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      expired: r.expiresAt ? r.expiresAt < new Date() : false,
      createdAt: r.createdAt.toISOString(),
    }));
    return json({ links });
  });
}

export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const b = schema.safeParse(await request.json().catch(() => ({})));
    if (!b.success) throw new HttpError(400, "invalid body");

    const video = await manageableVideo(id, user);
    if (video.status !== "ready") throw new HttpError(409, "not ready");

    const token = nanoid(22);
    await prisma.shareLink.create({
      data: {
        token,
        videoId: id,
        createdBy: user.email,
        expiresAt: b.data.expiresAt ? new Date(b.data.expiresAt) : null,
      },
    });
    await logAudit(user.email, "share.create", id);
    return json({ token, url: `${env.NEXTAUTH_URL}/s/${token}` }, 201);
  });
}
