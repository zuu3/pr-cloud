import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertRate } from "@/lib/ratelimit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const { id } = await params;
    const rows = await prisma.comment.findMany({
      where: { videoId: id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, author: true, body: true, atSec: true, createdAt: true },
    });
    return json({ comments: rows });
  });
}

const schema = z.object({
  body: z.string().trim().min(1).max(2000),
  atSec: z.number().int().nonnegative().max(360000).nullish(),
});

export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    assertRate(`comment:${user.email}`, 60, 60_000);

    const video = await prisma.video.findUnique({
      where: { id },
      select: { deletedAt: true, status: true },
    });
    if (!video || video.deletedAt || video.status !== "ready") {
      throw new HttpError(404, "not found");
    }

    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");

    const c = await prisma.comment.create({
      data: {
        videoId: id,
        author: user.email,
        body: b.data.body,
        atSec: b.data.atSec ?? null,
      },
      select: { id: true, author: true, body: true, atSec: true, createdAt: true },
    });
    return json({ comment: c }, 201);
  });
}
