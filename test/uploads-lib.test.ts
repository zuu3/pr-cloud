import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  process.env.SINGLE_PUT_MAX_BYTES = "94371840";
});
afterAll(async () => {
  await db.stop();
});

describe("uploads lib", () => {
  it("part math", async () => {
    const { PART_SIZE, needsMultipart, partCount } = await import("@/lib/uploads");
    expect(needsMultipart(90 * 1024 * 1024)).toBe(false);
    expect(needsMultipart(90 * 1024 * 1024 + 1)).toBe(true);
    expect(partCount(0)).toBe(1);
    expect(partCount(PART_SIZE * 3 + 1)).toBe(4);
  });

  it("extOf", async () => {
    const { extOf } = await import("@/lib/uploads");
    expect(extOf("a.b.MP4")).toBe("MP4");
    expect(extOf("noext")).toBe("");
  });

  it("assertUploadOwner rejects other users", async () => {
    const { assertUploadOwner } = await import("@/lib/uploads");
    const v = await db.prisma.video.create({
      data: {
        title: "t",
        s3Key: "k1",
        originalFilename: "x",
        uploadedBy: "owner@x",
        status: "uploading",
      },
    });
    await db.prisma.upload.create({
      data: { videoId: v.id, s3UploadId: "up1", partSize: 1 },
    });
    await expect(assertUploadOwner("k1", "up1", "intruder@x")).rejects.toMatchObject({
      status: 403,
    });
    await expect(assertUploadOwner("k1", "up1", "owner@x")).resolves.toMatchObject({
      videoId: v.id,
    });
    await expect(assertUploadOwner("nope", "up1", "owner@x")).rejects.toMatchObject({
      status: 404,
    });
  });
});
