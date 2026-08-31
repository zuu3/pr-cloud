import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const folders = await prisma.folder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true },
    });
    return json({ folders });
  });
}

const schema = z.object({
  name: z.string().min(1).max(20),
  parentId: z.string().uuid().optional(),
});

export const MAX_FOLDER_DEPTH = 3; // 보관함 > 1 > 2 > 3

async function depthOf(folderId: string): Promise<number> {
  let depth = 1;
  let id: string | null = folderId;
  while (id && depth < 50) {
    const f: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id },
      select: { parentId: true },
    });
    if (!f || !f.parentId) break;
    id = f.parentId;
    depth++;
  }
  return depth;
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");

    if (b.data.parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: b.data.parentId } });
      if (!parent) throw new HttpError(400, "parent not found");
      if ((await depthOf(b.data.parentId)) >= MAX_FOLDER_DEPTH) {
        throw new HttpError(400, `폴더는 ${MAX_FOLDER_DEPTH}단계까지만 만들 수 있어요`);
      }
    }
    const folder = await prisma.folder.create({
      data: { name: b.data.name, parentId: b.data.parentId ?? null, createdBy: user.email },
      select: { id: true, name: true, parentId: true },
    });
    await logAudit(user.email, "folder.create", folder.id);
    return json({ folder }, 201);
  });
}
