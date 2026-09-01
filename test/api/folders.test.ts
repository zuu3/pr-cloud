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

  it("allows nesting past 3 levels (no product depth limit)", async () => {
    const { POST } = await import("@/app/api/folders/route");
    let parentId: string | undefined;
    for (let i = 0; i < 8; i++) {
      const res = await POST(req("/api/folders", jbody({ name: `L${i}`, parentId })));
      expect(res.status).toBe(201);
      parentId = (await res.json()).folder.id;
    }
  });

  it("still guards against a pathological deep chain (MAX_FOLDER_DEPTH safety rail)", async () => {
    const { POST } = await import("@/app/api/folders/route");
    let parentId: string | undefined;
    for (let i = 0; i < 30; i++) {
      const res = await POST(req("/api/folders", jbody({ name: `D${i}`, parentId })));
      expect(res.status).toBe(201);
      parentId = (await res.json()).folder.id;
    }
    const tooDeep = await POST(req("/api/folders", jbody({ name: "D30", parentId })));
    expect(tooDeep.status).toBe(400);
  });
});
