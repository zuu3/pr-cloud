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
  await db.prisma.comment.deleteMany();
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
      uploadedBy: "someone@school",
    },
  });
}

describe("/api/videos/[id]/comments", () => {
  it("creates a comment with a timestamp and lists it", async () => {
    const v = await mkVideo();
    const { POST, GET } = await import("@/app/api/videos/[id]/comments/route");
    const ctx = { params: Promise.resolve({ id: v.id }) };

    const r = await POST(req(`/api/videos/${v.id}/comments`, jbody({ body: "자막 오타", atSec: 80 })), ctx);
    expect(r.status).toBe(201);

    const list = await (await GET(req(`/api/videos/${v.id}/comments`), ctx)).json();
    expect(list.comments).toHaveLength(1);
    expect(list.comments[0]).toMatchObject({ body: "자막 오타", atSec: 80, author: "me@school" });
  });

  it("rejects an empty body", async () => {
    const v = await mkVideo();
    const { POST } = await import("@/app/api/videos/[id]/comments/route");
    const r = await POST(
      req(`/api/videos/${v.id}/comments`, jbody({ body: "   " })),
      { params: Promise.resolve({ id: v.id }) },
    );
    expect(r.status).toBe(400);
  });

  it("a non-author non-admin cannot delete", async () => {
    const v = await mkVideo();
    const c = await db.prisma.comment.create({
      data: { videoId: v.id, author: "other@school", body: "x" },
    });
    const { DELETE } = await import("@/app/api/comments/[id]/route");
    const r = await DELETE(req(`/api/comments/${c.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: c.id }),
    });
    expect(r.status).toBe(403);
  });

  it("an admin can delete anyone's comment", async () => {
    mockSession({ email: "admin@school", role: "admin" });
    const v = await mkVideo();
    const c = await db.prisma.comment.create({
      data: { videoId: v.id, author: "other@school", body: "x" },
    });
    const { DELETE } = await import("@/app/api/comments/[id]/route");
    const r = await DELETE(req(`/api/comments/${c.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: c.id }),
    });
    expect(r.status).toBe(200);
    const gone = await db.prisma.comment.findUnique({ where: { id: c.id } });
    expect(gone?.deletedAt).not.toBeNull();
  });
});
