import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const video = await prisma.video.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    if (!video || video.deletedAt) throw new HttpError(404, "not found");
    await prisma.favorite.upsert({
      where: { userEmail_videoId: { userEmail: user.email, videoId: id } },
      create: { userEmail: user.email, videoId: id },
      update: {},
    });
    return json({ favorited: true });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await prisma.favorite.deleteMany({ where: { userEmail: user.email, videoId: id } });
    return json({ favorited: false });
  });
}
