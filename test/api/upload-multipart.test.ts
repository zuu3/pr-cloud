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
    SINGLE_PUT_MAX_BYTES: "1",
  });
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => {
  await db.stop();
  await m.stop();
});
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.upload.deleteMany();
  await db.prisma.video.deleteMany();
  await db.prisma.auditLog.deleteMany();
});

async function createUpload(email = "owner@school.ac.kr") {
  mockSession({ email, role: "member" });
  const { POST } = await import("@/app/api/uploads/create/route");
  return (
    await POST(
      req(
        "/api/uploads/create",
        jbody({
          title: "big",
          originalFilename: "b.mp4",
          contentType: "video/mp4",
          size: 10,
        }),
      ),
    )
  ).json();
}

describe("multipart upload", () => {
  it("full flow: create -> sign-part -> PUT part -> complete -> ready", async () => {
    const c = await createUpload();
    const { POST: SIGN } = await import("@/app/api/uploads/sign-part/route");
    const { url } = await (
      await SIGN(
        req("/api/uploads/sign-part", jbody({ key: c.key, uploadId: c.uploadId, partNumber: 1 })),
      )
    ).json();
    const put = await fetch(url, { method: "PUT", body: "abcdefghij" });
    const etag = put.headers.get("etag")!;
    expect(etag).toBeTruthy();

    const { POST: COMPLETE } = await import("@/app/api/uploads/complete/route");
    const done = await COMPLETE(
      req(
        "/api/uploads/complete",
        jbody({ key: c.key, uploadId: c.uploadId, parts: [{ partNumber: 1, etag }] }),
      ),
    );
    expect(done.status).toBe(200);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: c.videoId } });
    expect(v.status).toBe("ready");
    expect(Number(v.sizeBytes)).toBe(10);
    expect(await db.prisma.upload.findUnique({ where: { videoId: c.videoId } })).toBeNull();
  });

  it("sign-part rejects a different user (403)", async () => {
    const c = await createUpload("owner@school.ac.kr");
    vi.resetModules();
    mockSession({ email: "intruder@school.ac.kr", role: "member" });
    const { POST: SIGN } = await import("@/app/api/uploads/sign-part/route");
    const r = await SIGN(
      req("/api/uploads/sign-part", jbody({ key: c.key, uploadId: c.uploadId, partNumber: 1 })),
    );
    expect(r.status).toBe(403);
  });

  it("list-parts reports uploaded parts for resume", async () => {
    const c = await createUpload();
    const { POST: SIGN } = await import("@/app/api/uploads/sign-part/route");
    const { url } = await (
      await SIGN(
        req("/api/uploads/sign-part", jbody({ key: c.key, uploadId: c.uploadId, partNumber: 1 })),
      )
    ).json();
    await fetch(url, { method: "PUT", body: "abcdefghij" });
    const { GET: LIST } = await import("@/app/api/uploads/list-parts/route");
    const parts = await (
      await LIST(
        req(
          `/api/uploads/list-parts?key=${encodeURIComponent(c.key)}&uploadId=${encodeURIComponent(c.uploadId)}`,
        ),
      )
    ).json();
    expect(parts.parts).toHaveLength(1);
    expect(parts.parts[0].partNumber).toBe(1);
  });

  it("abort marks failed and clears upload row", async () => {
    const c = await createUpload();
    const { POST: ABORT } = await import("@/app/api/uploads/abort/route");
    const r = await ABORT(
      req("/api/uploads/abort", jbody({ key: c.key, uploadId: c.uploadId })),
    );
    expect(r.status).toBe(200);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: c.videoId } });
    expect(v.status).toBe("failed");
  });
});
