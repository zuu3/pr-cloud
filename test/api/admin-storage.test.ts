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
  await db.prisma.folder.deleteMany();
  delete process.env.STORAGE_QUOTA_BYTES;
});

async function mkVideo(over: Record<string, unknown>) {
  return db.prisma.video.create({
    data: {
      title: "t",
      s3Key: `promo-video/k-${Math.random()}.mp4`,
      originalFilename: "a.mp4",
      status: "ready",
      uploadedBy: "a@school",
      sizeBytes: 1000n,
      ...over,
    },
  });
}

describe("GET /api/admin/storage", () => {
  it("requires admin", async () => {
    mockSession({ email: "kid@school", role: "member" });
    const { GET } = await import("@/app/api/admin/storage/route");
    expect((await GET()).status).toBe(403);
  });

  it("totals live vs trash and ranks by user and folder", async () => {
    mockSession({ email: "admin@school", role: "admin" });
    process.env.STORAGE_QUOTA_BYTES = "10000";
    const f = await db.prisma.folder.create({ data: { name: "행사" } });
    await mkVideo({ uploadedBy: "a@school", sizeBytes: 3000n, folderId: f.id });
    await mkVideo({ uploadedBy: "b@school", sizeBytes: 1000n });
    await mkVideo({ uploadedBy: "a@school", sizeBytes: 500n, deletedAt: new Date() });

    const { GET } = await import("@/app/api/admin/storage/route");
    const r = await GET();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.totalBytes).toBe(4000);
    expect(d.totalCount).toBe(2);
    expect(d.trashBytes).toBe(500);
    expect(d.quota).toBe(10000);
    expect(d.byUser[0]).toMatchObject({ email: "a@school", bytes: 3000, count: 1 });
    expect(d.byFolder.find((x: { folder: string }) => x.folder === "행사")).toMatchObject({
      bytes: 3000,
    });
  });
});

describe("POST /api/admin/reconcile", () => {
  it("requires admin", async () => {
    mockSession({ email: "kid@school", role: "member" });
    const { POST } = await import("@/app/api/admin/reconcile/route");
    expect((await POST()).status).toBe(403);
  });

  it("runs a global sweep and reports counts", async () => {
    mockSession({ email: "admin@school", role: "admin" });
    await mkVideo({
      status: "pending",
      uploadedBy: "kid@school",
      createdAt: new Date(Date.now() - 25 * 3_600_000),
    });
    const { POST } = await import("@/app/api/admin/reconcile/route");
    const r = await POST();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.scanned).toBe(1);
    expect(d.failed).toBe(1);
  });
});
