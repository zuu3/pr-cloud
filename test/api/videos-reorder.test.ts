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
  mockSession({ email: "me@school", role: "member" });
});

async function mk(over: Record<string, unknown>) {
  return db.prisma.video.create({
    data: {
      title: "t",
      s3Key: `k-${Math.random()}`,
      originalFilename: "a.mp4",
      status: "ready",
      uploadedBy: "me@school",
      ...over,
    },
  });
}

describe("POST /api/videos/reorder", () => {
  it("writes position = index for the given order within a folder", async () => {
    const f = await db.prisma.folder.create({ data: { name: "F" } });
    const a = await mk({ folderId: f.id });
    const b = await mk({ folderId: f.id });
    const c = await mk({ folderId: f.id });

    const { POST } = await import("@/app/api/videos/reorder/route");
    const r = await POST(
      req("/api/videos/reorder", jbody({ folderId: f.id, orderedIds: [c.id, a.id, b.id] })),
    );
    expect(r.status).toBe(200);

    const pos = Object.fromEntries(
      (await db.prisma.video.findMany({ select: { id: true, position: true } })).map((v) => [
        v.id,
        v.position,
      ]),
    );
    expect(pos[c.id]).toBe(0);
    expect(pos[a.id]).toBe(1);
    expect(pos[b.id]).toBe(2);
  });

  it("ignores ids not owned or not in the folder", async () => {
    const f = await db.prisma.folder.create({ data: { name: "F" } });
    const mine = await mk({ folderId: f.id });
    const theirs = await mk({ folderId: f.id, uploadedBy: "other@school" });
    const elsewhere = await mk({ folderId: null });

    const { POST } = await import("@/app/api/videos/reorder/route");
    const r = await POST(
      req(
        "/api/videos/reorder",
        jbody({ folderId: f.id, orderedIds: [theirs.id, elsewhere.id, mine.id] }),
      ),
    );
    expect((await r.json()).count).toBe(1);
    const rows = await db.prisma.video.findMany({ select: { id: true, position: true } });
    const pos = Object.fromEntries(rows.map((v) => [v.id, v.position]));
    expect(pos[mine.id]).toBe(2);
    expect(pos[theirs.id]).toBeNull();
    expect(pos[elsewhere.id]).toBeNull();
  });
});
