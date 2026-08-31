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
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  await db.prisma.shareLink.deleteMany();
  await db.prisma.video.deleteMany();
  await db.prisma.folder.deleteMany();
  mockSession({ email: "kid@school", role: "member" });
});

describe("folder share", () => {
  it("creates a link and streams member videos through the token", async () => {
    const f = await db.prisma.folder.create({ data: { name: "행사" } });
    const v = await db.prisma.video.create({
      data: {
        title: "a",
        s3Key: "ka",
        originalFilename: "a.mp4",
        status: "ready",
        folderId: f.id,
      },
    });

    const { POST } = await import("@/app/api/folders/[id]/share/route");
    const s = await (
      await POST(req(`/api/folders/${f.id}/share`, jbody({})), {
        params: Promise.resolve({ id: f.id }),
      })
    ).json();
    expect(s.url).toBe(`https://promo.madp.cloud/s/${s.token}`);

    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
    const { GET } = await import("@/app/s/[token]/v/[videoId]/url/route");
    const r = await GET(req(`/s/${s.token}/v/${v.id}/url`), {
      params: Promise.resolve({ token: s.token, videoId: v.id }),
    });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain(m.endpoint);
  });

  it("a folder token cannot stream a video outside the folder", async () => {
    const f = await db.prisma.folder.create({ data: { name: "행사" } });
    const outside = await db.prisma.video.create({
      data: { title: "x", s3Key: "kx", originalFilename: "x.mp4", status: "ready", folderId: null },
    });
    const link = await db.prisma.shareLink.create({
      data: { token: "g".repeat(22), folderId: f.id },
    });
    const { GET } = await import("@/app/s/[token]/v/[videoId]/url/route");
    const r = await GET(req(`/s/${link.token}/v/${outside.id}/url`), {
      params: Promise.resolve({ token: link.token, videoId: outside.id }),
    });
    expect(r.status).toBe(404);
  });

  it("the old single-video /s/[token]/url 404s for a folder token", async () => {
    const f = await db.prisma.folder.create({ data: { name: "행사" } });
    const link = await db.prisma.shareLink.create({
      data: { token: "h".repeat(22), folderId: f.id },
    });
    const { GET } = await import("@/app/s/[token]/url/route");
    const r = await GET(req(`/s/${link.token}/url`), {
      params: Promise.resolve({ token: link.token }),
    });
    expect(r.status).toBe(404);
  });
});
