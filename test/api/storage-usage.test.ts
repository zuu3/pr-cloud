import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { mockSession } from "../helpers/req";

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
  delete process.env.STORAGE_QUOTA_BYTES;
  mockSession({ email: "kid@school", role: "member" });
});

async function mk(size: number, over: Record<string, unknown> = {}) {
  return db.prisma.video.create({
    data: {
      title: "v",
      s3Key: `k-${Math.random()}`,
      originalFilename: "a.mp4",
      status: "ready",
      uploadedBy: "kid@school",
      sizeBytes: BigInt(size),
      ...over,
    },
  });
}

describe("GET /api/storage/usage", () => {
  it("returns pct null when no quota is set", async () => {
    const { GET } = await import("@/app/api/storage/usage/route");
    expect((await (await GET()).json()).pct).toBeNull();
  });

  it("computes pct against the quota, ignoring trash", async () => {
    process.env.STORAGE_QUOTA_BYTES = "1000";
    await mk(600);
    await mk(300);
    await mk(500, { deletedAt: new Date() });
    const { GET } = await import("@/app/api/storage/usage/route");
    const d = await (await GET()).json();
    expect(d.pct).toBe(90);
    expect(d.usedBytes).toBe(900);
  });
});
