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
  mockSession({ email: "kid@school", role: "member" });
});

async function mkVideo(over: Record<string, unknown>) {
  return db.prisma.video.create({
    data: {
      title: "t",
      s3Key: `promo-video/k-${Math.random()}.mp4`,
      originalFilename: "a.mp4",
      status: "pending",
      uploadedBy: "kid@school",
      ...over,
    },
  });
}

describe("GET /api/uploads/pending", () => {
  it("lists the caller's unfinished uploads, not others', not ready ones", async () => {
    await mkVideo({ title: "mine-pending", createdAt: new Date(Date.now() - 60_000) });
    await mkVideo({ title: "mine-ready", status: "ready" });
    await mkVideo({ title: "mine-failed", status: "failed" });
    await mkVideo({ title: "theirs", uploadedBy: "other@school" });

    const { GET } = await import("@/app/api/uploads/pending/route");
    const r = await GET();
    expect(r.status).toBe(200);
    const { uploads } = await r.json();
    const titles = uploads.map((u: { title: string }) => u.title).sort();
    expect(titles).toEqual(["mine-failed", "mine-pending"]);
  });
});

describe("DELETE /api/uploads/pending", () => {
  it("discards the caller's own dead upload", async () => {
    const v = await mkVideo({ status: "failed" });
    const { DELETE } = await import("@/app/api/uploads/pending/route");
    const r = await DELETE(req(`/api/uploads/pending?id=${v.id}`, { method: "DELETE" }));
    expect(r.status).toBe(200);
    expect(await db.prisma.video.findUnique({ where: { id: v.id } })).toBeNull();
  });

  it("refuses someone else's upload", async () => {
    const v = await mkVideo({ uploadedBy: "other@school", status: "failed" });
    const { DELETE } = await import("@/app/api/uploads/pending/route");
    const r = await DELETE(req(`/api/uploads/pending?id=${v.id}`, { method: "DELETE" }));
    expect(r.status).toBe(403);
    expect(await db.prisma.video.findUnique({ where: { id: v.id } })).not.toBeNull();
  });

  it("refuses an already-ready upload", async () => {
    const v = await mkVideo({ status: "ready" });
    const { DELETE } = await import("@/app/api/uploads/pending/route");
    const r = await DELETE(req(`/api/uploads/pending?id=${v.id}`, { method: "DELETE" }));
    expect(r.status).toBe(409);
  });
});
