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
  await db.prisma.folder.deleteMany();
});

describe("resolveShare", () => {
  it("returns title for a valid link", async () => {
    const v = await db.prisma.video.create({
      data: { title: "공개영상", s3Key: "k", originalFilename: "a.mp4", status: "ready" },
    });
    await db.prisma.shareLink.create({ data: { token: "x".repeat(22), videoId: v.id } });
    const { resolveShare } = await import("@/lib/share");
    expect(await resolveShare("x".repeat(22))).toMatchObject({
      kind: "video",
      title: "공개영상",
      videoId: v.id,
    });
  });

  it("resolves a folder link with its ready videos (recursive)", async () => {
    const parent = await db.prisma.folder.create({ data: { name: "행사" } });
    const child = await db.prisma.folder.create({ data: { name: "4교시", parentId: parent.id } });
    await db.prisma.video.createMany({
      data: [
        { title: "a", s3Key: "ka", originalFilename: "a.mp4", status: "ready", folderId: parent.id },
        { title: "b", s3Key: "kb", originalFilename: "b.mp4", status: "ready", folderId: child.id },
        { title: "pending", s3Key: "kc", originalFilename: "c.mp4", status: "uploading", folderId: parent.id },
      ],
    });
    await db.prisma.shareLink.create({ data: { token: "f".repeat(22), folderId: parent.id } });
    const { resolveShare } = await import("@/lib/share");
    const r = await resolveShare("f".repeat(22));
    expect(r?.kind).toBe("folder");
    expect(r && r.kind === "folder" && r.videos.map((v) => v.title).sort()).toEqual(["a", "b"]);
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
