import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { mockSession, req, jbody } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;

beforeAll(async () => {
  db = await startTestDb();
  m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint,
    S3_ENDPOINT_INTERNAL: m.endpoint,
    S3_REGION: "us-east-1",
    S3_BUCKET: m.bucket,
    S3_ACCESS_KEY: m.accessKey,
    S3_SECRET_KEY: m.secretKey,
  });
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => {
  await db.stop();
  await m.stop();
});
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.video.deleteMany();
  mockSession({ email: "owner@school.ac.kr", role: "member" });
});

async function readyVideo(extra: Record<string, unknown> = {}) {
  return db.prisma.video.create({
    data: {
      title: "t",
      s3Key: `k-${Math.random()}`,
      originalFilename: "a.mp4",
      status: "ready",
      uploadedBy: "owner@school.ac.kr",
      ...extra,
    },
  });
}

describe("video lifecycle", () => {
  it("PATCH edits title + description", async () => {
    const v = await readyVideo();
    const { PATCH } = await import("@/app/api/videos/[id]/route");
    const r = await PATCH(req(`/api/videos/${v.id}`, jbody({ title: "새 제목", description: "메모" })), {
      params: Promise.resolve({ id: v.id }),
    });
    expect(r.status).toBe(200);
    const row = await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } });
    expect(row.title).toBe("새 제목");
    expect(row.description).toBe("메모");
  });

  it("DELETE soft-deletes; list hides it; trash shows it; restore brings it back", async () => {
    const v = await readyVideo();
    const routes = await import("@/app/api/videos/[id]/route");
    const list = await import("@/app/api/videos/route");

    expect(
      (await routes.DELETE(req(`/api/videos/${v.id}`), { params: Promise.resolve({ id: v.id }) }))
        .status,
    ).toBe(204);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).deletedAt).not.toBeNull();

    let data = await (await list.GET(req("/api/videos"))).json();
    expect(data.videos).toHaveLength(0);
    data = await (await list.GET(req("/api/videos?trash=1"))).json();
    expect(data.videos.map((x: { id: string }) => x.id)).toContain(v.id);

    const restore = await routes.POST(req(`/api/videos/${v.id}?action=restore`, { method: "POST" }), {
      params: Promise.resolve({ id: v.id }),
    });
    expect(restore.status).toBe(200);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).deletedAt).toBeNull();
  });

  it("DELETE ?purge=1 hard-deletes the row", async () => {
    const v = await readyVideo();
    const { DELETE } = await import("@/app/api/videos/[id]/route");
    const r = await DELETE(req(`/api/videos/${v.id}?purge=1`), {
      params: Promise.resolve({ id: v.id }),
    });
    expect(r.status).toBe(204);
    expect(await db.prisma.video.findUnique({ where: { id: v.id } })).toBeNull();
  });

  it("url route does not touch viewCount (the detail page owns view counting)", async () => {
    const v = await readyVideo();
    const { GET } = await import("@/app/api/videos/[id]/url/route");
    await GET(req(`/api/videos/${v.id}/url`), { params: Promise.resolve({ id: v.id }) });
    await GET(req(`/api/videos/${v.id}/url?disposition=attachment`), {
      params: Promise.resolve({ id: v.id }),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).viewCount).toBe(0);
  });
});
