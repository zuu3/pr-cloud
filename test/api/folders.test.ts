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
  await db.prisma.folder.deleteMany();
  mockSession({ email: "m@school.ac.kr", role: "member" });
});

describe("folders API", () => {
  it("creates nested folder and lists", async () => {
    const { POST, GET } = await import("@/app/api/folders/route");
    const root = await (await POST(req("/api/folders", jbody({ name: "2026" })))).json();
    const child = await POST(
      req("/api/folders", jbody({ name: "행사", parentId: root.folder.id })),
    );
    expect(child.status).toBe(201);
    const list = await (await GET()).json();
    expect(list.folders).toHaveLength(2);
  });

  it("rejects unknown parent", async () => {
    const { POST } = await import("@/app/api/folders/route");
    const r = await POST(
      req("/api/folders", jbody({ name: "x", parentId: "00000000-0000-0000-0000-000000000000" })),
    );
    expect(r.status).toBe(400);
  });
});
