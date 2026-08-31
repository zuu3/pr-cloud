import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { req } from "../helpers/req";

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
});
afterAll(async () => {
  await db.stop();
  await m.stop();
});
beforeEach(async () => {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  vi.doMock("@/lib/media", () => ({ generateMedia: vi.fn(async () => {}) }));
  await db.prisma.upload.deleteMany();
  await db.prisma.video.deleteMany();
  delete process.env.CRON_SECRET;
});

const post = (secret?: string) =>
  req("/api/cron/sweep", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {},
  });

describe("POST /api/cron/sweep", () => {
  it("503 when no secret is configured", async () => {
    const { POST } = await import("@/app/api/cron/sweep/route");
    expect((await POST(post("anything"))).status).toBe(503);
  });

  it("401 on a wrong secret", async () => {
    process.env.CRON_SECRET = "right";
    const { POST } = await import("@/app/api/cron/sweep/route");
    expect((await POST(post("wrong"))).status).toBe(401);
  });

  it("sweeps stuck uploads and expired trash on a good secret", async () => {
    process.env.CRON_SECRET = "right";
    await db.prisma.video.create({
      data: {
        title: "ghost",
        s3Key: `promo-video/ghost-${Math.random()}.mp4`,
        originalFilename: "a.mp4",
        status: "pending",
        uploadedBy: "kid@school",
        createdAt: new Date(Date.now() - 25 * 3_600_000),
      },
    });
    const trash = await db.prisma.video.create({
      data: {
        title: "old-trash",
        s3Key: `promo-video/oldtrash-${Math.random()}.mp4`,
        originalFilename: "a.mp4",
        status: "ready",
        uploadedBy: "kid@school",
        deletedAt: new Date(Date.now() - 31 * 24 * 3_600_000),
      },
    });

    const { POST } = await import("@/app/api/cron/sweep/route");
    const r = await POST(post("right"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.failed).toBe(1);
    expect(body.purged).toBe(1);
    expect(await db.prisma.video.findUnique({ where: { id: trash.id } })).toBeNull();
  });
});
