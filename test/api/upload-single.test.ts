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
    SINGLE_PUT_MAX_BYTES: "94371840",
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
  mockSession({ email: "owner@school.ac.kr", role: "member" });
});

describe("single-PUT upload", () => {
  it("rejects large files with multipart hint", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const r = await POST(
      req(
        "/api/uploads",
        jbody({
          title: "big",
          originalFilename: "b.mp4",
          contentType: "video/mp4",
          size: 200 * 1024 * 1024,
        }),
      ),
    );
    expect(r.status).toBe(400);
    expect((await r.json()).multipart).toBe(true);
  });

  it("happy path: create -> PUT -> complete sets ready + size", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const created = await (
      await POST(
        req(
          "/api/uploads",
          jbody({
            title: "clip",
            originalFilename: "c.mp4",
            contentType: "video/mp4",
            size: 5,
          }),
        ),
      )
    ).json();
    const put = await fetch(created.url, {
      method: "PUT",
      body: "hello",
      headers: { "content-type": "video/mp4" },
    });
    expect(put.ok).toBe(true);

    const { POST: COMPLETE } = await import("@/app/api/uploads/[videoId]/complete/route");
    const done = await COMPLETE(req(`/api/uploads/${created.videoId}/complete`, { method: "POST" }), {
      params: Promise.resolve({ videoId: created.videoId }),
    });
    expect(done.status).toBe(200);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: created.videoId } });
    expect(v.status).toBe("ready");
    expect(Number(v.sizeBytes)).toBe(5);
  });

  it("complete without object -> failed + 409", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const created = await (
      await POST(
        req(
          "/api/uploads",
          jbody({
            title: "x",
            originalFilename: "x.mp4",
            contentType: "video/mp4",
            size: 5,
          }),
        ),
      )
    ).json();
    const { POST: COMPLETE } = await import("@/app/api/uploads/[videoId]/complete/route");
    const r = await COMPLETE(req(`/api/uploads/${created.videoId}/complete`, { method: "POST" }), {
      params: Promise.resolve({ videoId: created.videoId }),
    });
    expect(r.status).toBe(409);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: created.videoId } });
    expect(v.status).toBe("failed");
  });
});
