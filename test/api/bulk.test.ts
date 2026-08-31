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
  await db.prisma.folder.deleteMany();
  mockSession({ email: "owner@school.ac.kr", role: "member" });
});

async function mk(n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = await db.prisma.video.create({
      data: {
        title: `v${i}`,
        s3Key: `k${i}-${Math.random()}`,
        originalFilename: "a.mp4",
        status: "ready",
        uploadedBy: "owner@school.ac.kr",
      },
    });
    ids.push(v.id);
  }
  return ids;
}

describe("bulk videos", () => {
  it("trashes many at once", async () => {
    const ids = await mk(3);
    const { POST } = await import("@/app/api/videos/bulk/route");
    const r = await POST(req("/api/videos/bulk", jbody({ ids, action: "trash" })));
    expect(r.status).toBe(200);
    expect((await r.json()).count).toBe(3);
    expect(await db.prisma.video.count({ where: { deletedAt: { not: null } } })).toBe(3);
  });

  it("moves many into a folder", async () => {
    const ids = await mk(2);
    const f = await db.prisma.folder.create({ data: { name: "F" } });
    const { POST } = await import("@/app/api/videos/bulk/route");
    await POST(req("/api/videos/bulk", jbody({ ids, action: "move", folderId: f.id })));
    expect(await db.prisma.video.count({ where: { folderId: f.id } })).toBe(2);
  });

  it("purges many (hard delete)", async () => {
    const ids = await mk(2);
    const { POST } = await import("@/app/api/videos/bulk/route");
    await POST(req("/api/videos/bulk", jbody({ ids, action: "purge" })));
    expect(await db.prisma.video.count()).toBe(0);
  });

  it("only touches the caller's own videos", async () => {
    const mine = await mk(1);
    const other = await db.prisma.video.create({
      data: {
        title: "x",
        s3Key: "kx",
        originalFilename: "a.mp4",
        status: "ready",
        uploadedBy: "someone@else",
      },
    });
    const { POST } = await import("@/app/api/videos/bulk/route");
    const r = await POST(
      req("/api/videos/bulk", jbody({ ids: [...mine, other.id], action: "trash" })),
    );
    expect((await r.json()).count).toBe(1);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: other.id } })).deletedAt).toBeNull();
  });
});
