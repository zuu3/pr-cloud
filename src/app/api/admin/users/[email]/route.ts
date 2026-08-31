import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ email: string }> };
const roleSchema = z.object({ role: z.enum(["member", "admin"]) });

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { email } = await params;
    const body = roleSchema.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "invalid body");

    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) throw new HttpError(404, "not found");
    if (target.role === "admin" && body.data.role === "member") {
      const admins = await prisma.user.count({ where: { role: "admin" } });
      if (admins <= 1) throw new HttpError(409, "cannot demote last admin");
    }
    const user = await prisma.user.update({
      where: { email },
      data: { role: body.data.role },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    await logAudit(admin.email, "role.change", email);
    return json({ user });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { email } = await params;

    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) throw new HttpError(404, "not found");
    if (target.role === "admin") {
      const admins = await prisma.user.count({ where: { role: "admin" } });
      if (admins <= 1) throw new HttpError(409, "cannot remove last admin");
    }
    await prisma.user.delete({ where: { email } });
    await logAudit(admin.email, "user.remove", email);
    return new Response(null, { status: 204 });
  });
}
