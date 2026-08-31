import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { mockSession, req, jbody } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => {
  await db.stop();
});
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.auditLog.deleteMany();
  await db.prisma.user.deleteMany();
  await db.prisma.user.create({
    data: { email: "admin@school.ac.kr", role: "admin", status: "active" },
  });
});

describe("admin users API", () => {
  it("member is 403 on GET", async () => {
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("@/app/api/admin/users/route");
    expect((await GET()).status).toBe(403);
  });

  it("admin can invite, list, and it is audited", async () => {
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { POST, GET } = await import("@/app/api/admin/users/route");
    const c = await POST(req("/api/admin/users", jbody({ email: "new@school.ac.kr" })));
    expect(c.status).toBe(201);
    const list = await (await GET()).json();
    expect(list.users.map((u: { email: string }) => u.email)).toContain("new@school.ac.kr");
    const audit = await db.prisma.auditLog.findMany({ where: { action: "user.invite" } });
    expect(audit).toHaveLength(1);
  });

  it("accepts a bare local-part and stores the full school address", async () => {
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { POST } = await import("@/app/api/admin/users/route");
    const r = await POST(req("/api/admin/users", jbody({ email: "24.036" })));
    expect(r.status).toBe(201);
    expect((await r.json()).user.email).toBe("24.036@bssm.hs.kr");
  });

  it("duplicate invite is 409", async () => {
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { POST } = await import("@/app/api/admin/users/route");
    await POST(req("/api/admin/users", jbody({ email: "dup@school.ac.kr" })));
    expect(
      (await POST(req("/api/admin/users", jbody({ email: "dup@school.ac.kr" })))).status,
    ).toBe(409);
  });

  it("cannot remove the last admin", async () => {
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { DELETE } = await import("@/app/api/admin/users/[email]/route");
    const r = await DELETE(req("/api/admin/users/admin@school.ac.kr"), {
      params: Promise.resolve({ email: "admin@school.ac.kr" }),
    });
    expect(r.status).toBe(409);
  });

  it("can change role and demote when another admin exists", async () => {
    await db.prisma.user.create({
      data: { email: "a2@school.ac.kr", role: "admin", status: "active" },
    });
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { PATCH } = await import("@/app/api/admin/users/[email]/route");
    const r = await PATCH(req("/api/admin/users/a2@school.ac.kr", jbody({ role: "member" })), {
      params: Promise.resolve({ email: "a2@school.ac.kr" }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).user.role).toBe("member");
  });
});
