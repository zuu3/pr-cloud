import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { mockSession } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
const genSpy = vi.fn(async () => {});

beforeAll(async () => {
  db = await startTestDb();
});
afterAll(async () => {
  await db.stop();
});
beforeEach(async () => {
  vi.resetModules();
  genSpy.mockClear();
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  vi.doMock("@/lib/media", () => ({ generateMedia: genSpy }));
  await db.prisma.video.deleteMany();
});

async function mk(over: Record<string, unknown>) {
  return db.prisma.video.create({
    data: {
      title: "v",
      s3Key: `k-${Math.random()}`,
      originalFilename: "a.mp4",
      status: "ready",
      uploadedBy: "kid@school",
      ...over,
    },
  });
}

describe("POST /api/admin/regenerate-media", () => {
  it("requires admin", async () => {
    mockSession({ email: "kid@school", role: "member" });
    const { POST } = await import("@/app/api/admin/regenerate-media/route");
    expect((await POST()).status).toBe(403);
  });

  it("queues only videos missing a thumb or the playable flag", async () => {
    mockSession({ email: "admin@school", role: "admin" });
    await mk({ thumbKey: "t/1.jpg", playableInBrowser: true }); // complete — skip
    await mk({ thumbKey: null, playableInBrowser: true }); // missing thumb
    await mk({ thumbKey: "t/3.jpg", playableInBrowser: null }); // missing flag

    const { POST } = await import("@/app/api/admin/regenerate-media/route");
    const r = await POST();
    expect(r.status).toBe(200);
    expect((await r.json()).queued).toBe(2);
    await new Promise((res) => setTimeout(res, 50)); // let the background loop run
    expect(genSpy).toHaveBeenCalledTimes(2);
  });
});
