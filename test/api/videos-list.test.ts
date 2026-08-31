import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { mockSession, req } from "../helpers/req";

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
  await db.prisma.auditLog.deleteMany();
});

async function seedVideos() {
  await db.prisma.video.createMany({
    data: [
      { title: "체육대회 하이라이트", s3Key: "k1", originalFilename: "a.mp4", status: "ready" },
      { title: "축제 오프닝", s3Key: "k2", originalFilename: "b.mp4", status: "ready" },
      { title: "업로드중", s3Key: "k3", originalFilename: "c.mp4", status: "uploading" },
    ],
  });
}

describe("videos list API", () => {
  it("returns only ready videos at root", async () => {
    await seedVideos();
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("@/app/api/videos/route");
    const data = await (await GET(req("/api/videos"))).json();
    expect(data.videos).toHaveLength(2);
  });

  it("filters by q (case-insensitive)", async () => {
    await seedVideos();
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("@/app/api/videos/route");
    const data = await (await GET(req("/api/videos?q=축제"))).json();
    expect(data.videos.map((v: { title: string }) => v.title)).toEqual(["축제 오프닝"]);
  });

  it("mine=1 returns only the caller's uploads", async () => {
    await db.prisma.video.createMany({
      data: [
        { title: "mine-a", s3Key: "km1", originalFilename: "a.mp4", status: "ready", uploadedBy: "me@school.ac.kr" },
        { title: "theirs", s3Key: "km2", originalFilename: "b.mp4", status: "ready", uploadedBy: "you@school.ac.kr" },
      ],
    });
    mockSession({ email: "me@school.ac.kr", role: "member" });
    const { GET } = await import("@/app/api/videos/route");
    const data = await (await GET(req("/api/videos?mine=1"))).json();
    expect(data.videos.map((v: { title: string }) => v.title)).toEqual(["mine-a"]);
  });

  it("days=7 excludes videos older than the window", async () => {
    const old = await db.prisma.video.create({
      data: { title: "old", s3Key: "kd1", originalFilename: "a.mp4", status: "ready" },
    });
    await db.prisma.video.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 30 * 86_400_000) },
    });
    await db.prisma.video.create({
      data: { title: "recent", s3Key: "kd2", originalFilename: "b.mp4", status: "ready" },
    });
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("@/app/api/videos/route");
    const data = await (await GET(req("/api/videos?days=7"))).json();
    expect(data.videos.map((v: { title: string }) => v.title)).toEqual(["recent"]);
  });

  it("sort=views orders by view count", async () => {
    const a = await db.prisma.video.create({
      data: { title: "low", s3Key: "kv1", originalFilename: "a.mp4", status: "ready", viewCount: 2 },
    });
    const b = await db.prisma.video.create({
      data: { title: "high", s3Key: "kv2", originalFilename: "b.mp4", status: "ready", viewCount: 99 },
    });
    void a;
    void b;
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("@/app/api/videos/route");
    const data = await (await GET(req("/api/videos?sort=views"))).json();
    expect(data.videos.map((v: { title: string }) => v.title)).toEqual(["high", "low"]);
  });

  it("member cannot delete another user's video (403); admin can (204)", async () => {
    const v = await db.prisma.video.create({
      data: {
        title: "x",
        s3Key: "kd",
        originalFilename: "d.mp4",
        status: "ready",
        uploadedBy: "owner@school.ac.kr",
      },
    });
    mockSession({ email: "intruder@school.ac.kr", role: "member" });
    let mod = await import("@/app/api/videos/[id]/route");
    expect(
      (await mod.DELETE(req(`/api/videos/${v.id}`), { params: Promise.resolve({ id: v.id }) }))
        .status,
    ).toBe(403);

    vi.resetModules();
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    mod = await import("@/app/api/videos/[id]/route");
    expect(
      (await mod.DELETE(req(`/api/videos/${v.id}`), { params: Promise.resolve({ id: v.id }) }))
        .status,
    ).toBe(204);
  });
});
