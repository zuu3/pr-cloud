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
  mockSession({ email: "m@school.ac.kr", role: "member" });
});

describe("video url API", () => {
  it("409 when not ready", async () => {
    const v = await db.prisma.video.create({
      data: { title: "t", s3Key: "k", originalFilename: "a.mp4", status: "uploading" },
    });
    const { GET } = await import("@/app/api/videos/[id]/url/route");
    expect(
      (await GET(req(`/api/videos/${v.id}/url`), { params: Promise.resolve({ id: v.id }) }))
        .status,
    ).toBe(409);
  });

  it("attachment disposition includes filename", async () => {
    const v = await db.prisma.video.create({
      data: { title: "t", s3Key: "k", originalFilename: "내 영상.mp4", status: "ready" },
    });
    const { GET } = await import("@/app/api/videos/[id]/url/route");
    const { url } = await (
      await GET(req(`/api/videos/${v.id}/url?disposition=attachment`), {
        params: Promise.resolve({ id: v.id }),
      })
    ).json();
    expect(decodeURIComponent(url)).toContain('attachment; filename="내 영상.mp4"');
  });
});
