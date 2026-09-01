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
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  await db.prisma.video.deleteMany();
  await db.prisma.folder.deleteMany();
  mockSession({ email: "kid@school", role: "member" });
});

async function ensure(body: unknown) {
  const { POST } = await import("@/app/api/folders/ensure/route");
  return POST(req("/api/folders/ensure", jbody(body)));
}

describe("POST /api/folders/ensure", () => {
  it("creates a nested path and returns the leaf id", async () => {
    const r = await ensure({ segments: ["행사", "체육대회"] });
    expect(r.status).toBe(200);
    const { folderId } = await r.json();
    const leaf = await db.prisma.folder.findUniqueOrThrow({ where: { id: folderId } });
    expect(leaf.name).toBe("체육대회");
    const parent = await db.prisma.folder.findUniqueOrThrow({ where: { id: leaf.parentId! } });
    expect(parent.name).toBe("행사");
    expect(await db.prisma.folder.count()).toBe(2);
  });

  it("is idempotent — a second call reuses folders", async () => {
    const a = await (await ensure({ segments: ["A", "B"] })).json();
    const b = await (await ensure({ segments: ["A", "B"] })).json();
    expect(b.folderId).toBe(a.folderId);
    expect(await db.prisma.folder.count()).toBe(2);
  });

  it("creates the full path — no 3-level cap", async () => {
    const r = await ensure({ segments: ["1", "2", "3", "4", "5"] });
    const { folderId } = await r.json();
    const leaf = await db.prisma.folder.findUniqueOrThrow({ where: { id: folderId } });
    expect(leaf.name).toBe("5");
    expect(await db.prisma.folder.count()).toBe(5);
  });

  it("nests under parentId to full depth", async () => {
    const root = await db.prisma.folder.create({ data: { name: "root" } });
    const r = await ensure({ segments: ["x", "y", "z"], parentId: root.id });
    const { folderId } = await r.json();
    const leaf = await db.prisma.folder.findUniqueOrThrow({ where: { id: folderId } });
    expect(leaf.name).toBe("z");
    expect(await db.prisma.folder.count()).toBe(4); // root + x + y + z
  });
});
