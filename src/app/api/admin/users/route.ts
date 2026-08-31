import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    return json({ users });
  });
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = inviteSchema.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "invalid body");

    const exists = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (exists) throw new HttpError(409, "already exists");

    const user = await prisma.user.create({
      data: { email: body.data.email, role: body.data.role ?? "member", status: "invited" },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    await logAudit(admin.email, "user.invite", user.email);
    return json({ user }, 201);
  });
}
