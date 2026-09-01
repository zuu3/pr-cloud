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
  mockSession({ email: "kid@school", role: "member" });
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

describe("GET /api/thumb/[id]", () => {
  it("302s to a presigned URL when a thumbnail exists", async () => {
    const v = await mk({ thumbKey: "promo-video/thumb/x.jpg" });
    const { GET } = await import("@/app/api/thumb/[id]/route");
    const r = await GET(req(`/api/thumb/${v.id}`), { params: Promise.resolve({ id: v.id }) });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain(m.endpoint);
    expect(r.headers.get("cache-control")).toContain("max-age");
  });

  it("404 when there is no thumbnail", async () => {
    const v = await mk({ thumbKey: null });
    const { GET } = await import("@/app/api/thumb/[id]/route");
    const r = await GET(req(`/api/thumb/${v.id}`), { params: Promise.resolve({ id: v.id }) });
    expect(r.status).toBe(404);
  });

  it("404 for a trashed video", async () => {
    const v = await mk({ thumbKey: "promo-video/thumb/y.jpg", deletedAt: new Date() });
    const { GET } = await import("@/app/api/thumb/[id]/route");
    const r = await GET(req(`/api/thumb/${v.id}`), { params: Promise.resolve({ id: v.id }) });
    expect(r.status).toBe(404);
  });
});
