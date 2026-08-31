import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { MAX_FOLDER_DEPTH } from "@/lib/folders";
import { logAudit } from "@/lib/audit";

// Idempotently walks a path of folder names under `parentId`, creating what's
// missing, and returns the leaf folder id. Used by folder-drop uploads to
// recreate the on-disk structure. Stops creating past MAX_FOLDER_DEPTH — deeper
// files land in the deepest allowed folder.
const schema = z.object({
  segments: z.array(z.string().trim().min(1).max(20)).max(20),
  parentId: z.string().uuid().nullish(),
});

async function depthOf(id: string | null): Promise<number> {
  let d = 0;
  let cur = id;
  while (cur && d < 50) {
    const f: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cur },
      select: { parentId: true },
    });
    if (!f) break;
    d++;
    cur = f.parentId;
  }
  return d;
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");

    let parentId = b.data.parentId ?? null;
    if (parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: parentId } });
      if (!parent) throw new HttpError(400, "parent not found");
    }

    let depth = await depthOf(parentId);
    for (const name of b.data.segments) {
      if (depth >= MAX_FOLDER_DEPTH) break;
      const existing = await prisma.folder.findFirst({
        where: { name, parentId },
        select: { id: true },
      });
      if (existing) {
        parentId = existing.id;
      } else {
        const created = await prisma.folder.create({
          data: { name, parentId, createdBy: user.email },
          select: { id: true },
        });
        await logAudit(user.email, "folder.create", created.id);
        parentId = created.id;
      }
      depth++;
    }

    return json({ folderId: parentId });
  });
}
