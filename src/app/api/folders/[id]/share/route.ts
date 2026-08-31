import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ expiresAt: z.string().datetime().optional() });

function view(r: { id: string; token: string; expiresAt: Date | null; createdAt: Date }) {
  return {
    id: r.id,
    url: `${env.NEXTAUTH_URL}/s/${r.token}`,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    expired: r.expiresAt ? r.expiresAt < new Date() : false,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const { id } = await params;
    if (!(await prisma.folder.findUnique({ where: { id } }))) throw new HttpError(404, "not found");
    const rows = await prisma.shareLink.findMany({
      where: { folderId: id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });
    return json({ links: rows.map(view) });
  });
}

export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const b = schema.safeParse(await request.json().catch(() => ({})));
    if (!b.success) throw new HttpError(400, "invalid body");
    if (!(await prisma.folder.findUnique({ where: { id } }))) throw new HttpError(404, "not found");

    const token = nanoid(22);
    await prisma.shareLink.create({
      data: {
        token,
        folderId: id,
        createdBy: user.email,
        expiresAt: b.data.expiresAt ? new Date(b.data.expiresAt) : null,
      },
    });
    await logAudit(user.email, "share.create", id);
    return json({ token, url: `${env.NEXTAUTH_URL}/s/${token}` }, 201);
  });
}
