import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";

// Manual ordering within one folder. Sets position = index for the given ids.
// Scoped to the caller's own videos (admin: any). Ids not in the folder or not
// owned are ignored, so a stale client can't shuffle someone else's videos.
const schema = z.object({
  folderId: z.string().uuid().nullable(),
  orderedIds: z.array(z.string().uuid()).min(1).max(2000),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");

    const scope =
      user.role === "admin"
        ? { folderId: b.data.folderId }
        : { folderId: b.data.folderId, uploadedBy: user.email };
    const owned = new Set(
      (
        await prisma.video.findMany({
          where: { ...scope, id: { in: b.data.orderedIds }, deletedAt: null },
          select: { id: true },
        })
      ).map((v) => v.id),
    );

    // position = index in the full order the client sent; ids we skip keep their gap
    await prisma.$transaction(
      b.data.orderedIds.flatMap((id, i) =>
        owned.has(id) ? [prisma.video.update({ where: { id }, data: { position: i } })] : [],
      ),
    );
    return json({ count: owned.size });
  });
}
