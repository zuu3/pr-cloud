import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => {
  await db.stop();
});
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.shareLink.deleteMany();
  await db.prisma.video.deleteMany();
});

describe("resolveShare", () => {
  it("returns title for a valid link", async () => {
    const v = await db.prisma.video.create({
      data: { title: "공개영상", s3Key: "k", originalFilename: "a.mp4", status: "ready" },
    });
    await db.prisma.shareLink.create({ data: { token: "x".repeat(22), videoId: v.id } });
    const { resolveShare } = await import("@/lib/share");
    expect(await resolveShare("x".repeat(22))).toEqual({ title: "공개영상" });
  });

  it("returns null for revoked", async () => {
    const v = await db.prisma.video.create({
      data: { title: "t", s3Key: "k", originalFilename: "a.mp4", status: "ready" },
    });
    await db.prisma.shareLink.create({
      data: { token: "y".repeat(22), videoId: v.id, revokedAt: new Date() },
    });
    const { resolveShare } = await import("@/lib/share");
    expect(await resolveShare("y".repeat(22))).toBeNull();
  });
});
