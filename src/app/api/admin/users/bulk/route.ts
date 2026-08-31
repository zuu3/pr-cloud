import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/school";

const schema = z.object({ raw: z.string().min(1).max(20_000) });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STUDENT_RE = /^\d{1,2}\.\d{1,4}$/;

/** Paste a list of emails / student numbers (any whitespace or comma separated). */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");

    const invalid: string[] = [];
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const raw of b.data.raw.split(/[\s,;]+/)) {
      const t = raw.trim();
      if (!t) continue;
      if (!t.includes("@") && !STUDENT_RE.test(t)) {
        invalid.push(t);
        continue;
      }
      const e = normalizeEmail(t);
      if (!EMAIL_RE.test(e)) {
        invalid.push(t);
      } else if (!seen.has(e)) {
        seen.add(e);
        emails.push(e);
      }
    }

    const existing = new Set(
      (
        await prisma.user.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      ).map((u) => u.email),
    );
    const toAdd = emails.filter((e) => !existing.has(e));

    if (toAdd.length > 0) {
      await prisma.user.createMany({
        data: toAdd.map((email) => ({
          email,
          role: "member" as const,
          status: "invited" as const,
        })),
        skipDuplicates: true,
      });
      await logAudit(admin.email, "user.invite.bulk", String(toAdd.length));
    }

    const added = await prisma.user.findMany({
      where: { email: { in: toAdd } },
      orderBy: { email: "asc" },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    return json({ added, skipped: emails.filter((e) => existing.has(e)), invalid });
  });
}
