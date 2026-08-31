import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/school";

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
  // bare local-part ("24.036") or full address; normalized + validated below
  email: z.string().min(1).max(200),
  role: z.enum(["member", "admin"]).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = inviteSchema.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "invalid body");

    const email = normalizeEmail(body.data.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "invalid email");

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new HttpError(409, "already exists");

    const user = await prisma.user.create({
      data: { email, role: body.data.role ?? "member", status: "invited" },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    await logAudit(admin.email, "user.invite", user.email);
    return json({ user }, 201);
  });
}
