import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { mockSession, req } from "../helpers/req";

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
  await db.prisma.favorite.deleteMany();
  await db.prisma.video.deleteMany();
  mockSession({ email: "me@school", role: "member" });
});

async function mkVideo() {
  return db.prisma.video.create({
    data: {
      title: "t",
      s3Key: `k-${Math.random()}`,
      originalFilename: "a.mp4",
      status: "ready",
      uploadedBy: "me@school",
    },
  });
}

describe("/api/videos/[id]/favorite", () => {
  it("PUT is idempotent, DELETE clears, and the list filter respects it", async () => {
    const v = await mkVideo();
    const { PUT, DELETE } = await import("@/app/api/videos/[id]/favorite/route");
    const ctx = { params: Promise.resolve({ id: v.id }) };

    await PUT(req(`/api/videos/${v.id}/favorite`, { method: "PUT" }), ctx);
    await PUT(req(`/api/videos/${v.id}/favorite`, { method: "PUT" }), ctx);
    expect(await db.prisma.favorite.count()).toBe(1);

    const { GET } = await import("@/app/api/videos/route");
    let body = await (await GET(req(`/api/videos?fav=1&folderId=all`))).json();
    expect(body.videos).toHaveLength(1);
    expect(body.videos[0].favorited).toBe(true);

    await DELETE(req(`/api/videos/${v.id}/favorite`, { method: "DELETE" }), ctx);
    expect(await db.prisma.favorite.count()).toBe(0);
    body = await (await GET(req(`/api/videos?fav=1&folderId=all`))).json();
    expect(body.videos).toHaveLength(0);
  });

  it("one user's favorite is invisible to another", async () => {
    const v = await mkVideo();
    const { PUT } = await import("@/app/api/videos/[id]/favorite/route");
    await PUT(req(`/api/videos/${v.id}/favorite`, { method: "PUT" }), {
      params: Promise.resolve({ id: v.id }),
    });

    mockSession({ email: "other@school", role: "member" });
    const { GET } = await import("@/app/api/videos/route");
    const body = await (await GET(req(`/api/videos?folderId=all`))).json();
    expect(body.videos[0].favorited).toBe(false);
  });
});
