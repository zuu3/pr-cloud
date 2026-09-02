import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const c = await prisma.comment.findUnique({ where: { id } });
    if (!c || c.deletedAt) throw new HttpError(404, "not found");
    if (c.author !== user.email && user.role !== "admin") {
      throw new HttpError(403, "본인 댓글만 지울 수 있어요");
    }

    await prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
}
