import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { folderPath } from "@/lib/folders";
import type { Prisma } from "@prisma/client";

const TYPE_PREFIX: Record<string, string[]> = {
  video: ["upload", "delete", "video."],
  folder: ["folder."],
  share: ["share."],
  account: ["user.", "role."],
};

// the raw id is the first token of targetId (folder.delete stashes extra info after a space)
const rawId = (t: string | null) => (t ? t.split(" ")[0] : null);

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const p = new URL(request.url).searchParams;
    const cursor = p.get("cursor");
    const q = p.get("q")?.trim();
    const type = p.get("type");

    const and: Prisma.AuditLogWhereInput[] = [];
    if (q) and.push({ OR: [{ actorEmail: { contains: q } }, { action: { contains: q } }] });
    if (type && TYPE_PREFIX[type]) {
      and.push({ OR: TYPE_PREFIX[type].map((pre) => ({ action: { startsWith: pre } })) });
    }
    const where = and.length ? { AND: and } : {};

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      take: 51,
      ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 50);
    const nextCursor = rows.length > 50 ? rows[49].id.toString() : null;

    // resolve targetId -> readable label
    const ids = [...new Set(page.map((r) => rawId(r.targetId)).filter(Boolean) as string[])];
    const [vids, fols, users, folderTreeRows] = await Promise.all([
      prisma.video.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }),
      prisma.folder.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      prisma.user.findMany({
        where: { email: { in: [...new Set(page.map((r) => r.actorEmail).filter(Boolean) as string[])] } },
        select: { email: true, name: true, image: true },
      }),
      prisma.folder.findMany({ select: { id: true, name: true, parentId: true } }),
    ]);
    const vMap = new Map(vids.map((v) => [v.id, v.title]));
    const fMap = new Map(fols.map((f) => [f.id, f.id]));
    const uMap = new Map(users.map((u) => [u.email, u]));

    function label(action: string, targetId: string | null): string | null {
      const id = rawId(targetId);
      if (!id) return null;
      if (action.startsWith("user.") || action === "role.change") return id; // it's an email
      if (action.startsWith("folder.")) {
        return fMap.has(id) ? folderPath(folderTreeRows, id) : "삭제된 폴더";
      }
      return vMap.get(id) ?? "삭제된 영상";
    }

    const entries = page.map((r) => {
      const actor = r.actorEmail ? uMap.get(r.actorEmail) : undefined;
      return {
        id: r.id.toString(),
        actorEmail: r.actorEmail,
        actorName: actor?.name ?? null,
        actorImage: actor?.image ?? null,
        action: r.action,
        targetLabel: label(r.action, r.targetId),
        at: r.at.toISOString(),
      };
    });
    return json({ entries, nextCursor });
  });
}
