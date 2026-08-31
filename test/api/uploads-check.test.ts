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
  mockSession({ email: "kid@school", role: "member" });
});

async function mk(name: string, size: number | null, over: Record<string, unknown> = {}) {
  return db.prisma.video.create({
    data: {
      title: name,
      s3Key: `k-${Math.random()}`,
      originalFilename: name,
      sizeBytes: size == null ? null : BigInt(size),
      status: "ready",
      uploadedBy: "kid@school",
      ...over,
    },
  });
}

async function check(items: { name: string; size: number }[]) {
  const { POST } = await import("@/app/api/uploads/check/route");
  return (await POST(req("/api/uploads/check", jbody({ items })))).json();
}

describe("POST /api/uploads/check", () => {
  it("flags a name+size match", async () => {
    await mk("GX010123.MP4", 4_200_000_000);
    const { dupes } = await check([
      { name: "GX010123.MP4", size: 4_200_000_000 },
      { name: "GX010124.MP4", size: 900 },
    ]);
    expect(dupes).toEqual(["GX010123.MP4"]);
  });

  it("same name but different size is not a dupe", async () => {
    await mk("clip.mp4", 100);
    const { dupes } = await check([{ name: "clip.mp4", size: 200 }]);
    expect(dupes).toEqual([]);
  });

  it("ignores trashed videos", async () => {
    await mk("old.mp4", 500, { deletedAt: new Date() });
    const { dupes } = await check([{ name: "old.mp4", size: 500 }]);
    expect(dupes).toEqual([]);
  });
});
