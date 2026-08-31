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
    NEXTAUTH_URL: "https://promo.madp.cloud",
  });
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => {
  await db.stop();
  await m.stop();
});
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.shareLink.deleteMany();
  await db.prisma.video.deleteMany();
});

async function readyVideo() {
  return db.prisma.video.create({
    data: {
      title: "t",
      s3Key: "k",
      originalFilename: "a.mp4",
      status: "ready",
      uploadedBy: "owner@school.ac.kr",
    },
  });
}

describe("share links", () => {
  it("create returns absolute url, resolver 302s to presigned", async () => {
    const v = await readyVideo();
    mockSession({ email: "owner@school.ac.kr", role: "member" });
    const { POST } = await import("@/app/api/videos/[id]/share/route");
    const s = await (
      await POST(req(`/api/videos/${v.id}/share`, jbody({})), {
        params: Promise.resolve({ id: v.id }),
      })
    ).json();
    expect(s.url).toBe(`https://promo.madp.cloud/s/${s.token}`);

    vi.resetModules();
    const { GET } = await import("@/app/s/[token]/url/route");
    const r = await GET(req(`/s/${s.token}/url`), { params: Promise.resolve({ token: s.token }) });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain(m.endpoint);
  });

  it("trashed video -> share link 404", async () => {
    const v = await readyVideo();
    const link = await db.prisma.shareLink.create({
      data: { token: "trashed1trashed1trash12", videoId: v.id },
    });
    await db.prisma.video.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
    const { GET } = await import("@/app/s/[token]/url/route");
    const r = await GET(req(`/s/${link.token}/url`), {
      params: Promise.resolve({ token: link.token }),
    });
    expect(r.status).toBe(404);
  });

  it("revoked token -> 404", async () => {
    const v = await readyVideo();
    const link = await db.prisma.shareLink.create({
      data: { token: "revoked1revoked1revok12", videoId: v.id, revokedAt: new Date() },
    });
    const { GET } = await import("@/app/s/[token]/url/route");
    const r = await GET(req(`/s/${link.token}/url`), {
      params: Promise.resolve({ token: link.token }),
    });
    expect(r.status).toBe(404);
  });

  it("expired token -> 404", async () => {
    const v = await readyVideo();
    const link = await db.prisma.shareLink.create({
      data: { token: "expired1expired1expir12", videoId: v.id, expiresAt: new Date(Date.now() - 1000) },
    });
    const { GET } = await import("@/app/s/[token]/url/route");
    expect(
      (
        await GET(req(`/s/${link.token}/url`), {
          params: Promise.resolve({ token: link.token }),
        })
      ).status,
    ).toBe(404);
  });

  it("non-owner member cannot revoke (403); admin can (204)", async () => {
    const v = await readyVideo();
    const link = await db.prisma.shareLink.create({
      data: { token: "tok1tok1tok1tok1tok1t12", videoId: v.id, createdBy: "owner@school.ac.kr" },
    });
    mockSession({ email: "intruder@school.ac.kr", role: "member" });
    let mod = await import("@/app/api/share/[id]/route");
    expect(
      (await mod.DELETE(req(`/api/share/${link.id}`), { params: Promise.resolve({ id: link.id }) }))
        .status,
    ).toBe(403);

    vi.resetModules();
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    mod = await import("@/app/api/share/[id]/route");
    expect(
      (await mod.DELETE(req(`/api/share/${link.id}`), { params: Promise.resolve({ id: link.id }) }))
        .status,
    ).toBe(204);
  });
});
