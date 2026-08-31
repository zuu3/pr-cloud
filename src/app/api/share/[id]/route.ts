import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;

    const link = await prisma.shareLink.findUnique({ where: { id } });
    if (!link) throw new HttpError(404, "not found");
    if (user.role !== "admin" && link.createdBy !== user.email) {
      throw new HttpError(403, "forbidden");
    }
    await prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAudit(user.email, "share.revoke", link.videoId ?? link.folderId ?? undefined);
    return new Response(null, { status: 204 });
  });
}
