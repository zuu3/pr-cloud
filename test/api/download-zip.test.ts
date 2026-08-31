import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PutObjectCommand } from "@aws-sdk/client-s3";
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
  await db.prisma.video.deleteMany();
  await db.prisma.folder.deleteMany();
  mockSession({ email: "kid@school", role: "member" });
});

async function s3() {
  return import("@/lib/s3");
}

async function mkReady(over: Record<string, unknown>, bytes = 4096) {
  const key = `promo-video/z-${Math.random()}.mp4`;
  const { s3Internal, BUCKET } = await s3();
  await s3Internal.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.alloc(bytes, 3) }),
  );
  return db.prisma.video.create({
    data: {
      title: "v",
      s3Key: key,
      originalFilename: "clip.mp4",
      status: "ready",
      uploadedBy: "kid@school",
      sizeBytes: BigInt(bytes),
      ...over,
    },
  });
}

describe("GET /api/download/zip", () => {
  it("400 without folderId or ids", async () => {
    const { GET } = await import("@/app/api/download/zip/route");
    expect((await GET(req("/api/download/zip"))).status).toBe(400);
  });

  it("404 when the selection has no videos", async () => {
    const { GET } = await import("@/app/api/download/zip/route");
    expect((await GET(req("/api/download/zip?ids=00000000-0000-0000-0000-000000000000"))).status).toBe(
      404,
    );
  });

  it("streams a zip for a recursive folder selection", async () => {
    const parent = await db.prisma.folder.create({ data: { name: "행사" } });
    const child = await db.prisma.folder.create({ data: { name: "4교시", parentId: parent.id } });
    await mkReady({ folderId: parent.id });
    await mkReady({ folderId: child.id });
    await mkReady({ folderId: null }); // outside — must be excluded

    const { GET } = await import("@/app/api/download/zip/route");
    const r = await GET(req(`/api/download/zip?folderId=${parent.id}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/zip");
    expect(r.headers.get("content-disposition")).toContain("%ED%96%89%EC%82%AC.zip");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.length).toBeGreaterThan(8192); // 2 x 4KB payloads + zip framing
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK"); // zip magic
  });

  it("scopes ids to the caller unless admin", async () => {
    const mine = await mkReady({ uploadedBy: "kid@school" });
    const theirs = await mkReady({ uploadedBy: "other@school" });
    const { GET } = await import("@/app/api/download/zip/route");
    const r = await GET(req(`/api/download/zip?ids=${mine.id},${theirs.id}`));
    expect(r.status).toBe(200);
    const buf = Buffer.from(await r.arrayBuffer());
    // only one 4KB file inside
    expect(buf.length).toBeLessThan(8192);
  });
});
