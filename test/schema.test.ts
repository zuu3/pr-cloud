import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
});
afterAll(async () => {
  await db.stop();
});

describe("schema", () => {
  it("inserts a user and a video with defaults", async () => {
    await db.prisma.user.create({ data: { email: "a@school.ac.kr", role: "admin" } });
    const v = await db.prisma.video.create({
      data: { title: "t", s3Key: "promo-video/2026/x.mp4", originalFilename: "x.mp4" },
    });
    expect(v.status).toBe("pending");
    const u = await db.prisma.user.findUniqueOrThrow({ where: { email: "a@school.ac.kr" } });
    expect(u.status).toBe("invited");
  });

  it("rejects duplicate s3Key", async () => {
    await db.prisma.video.create({ data: { title: "t2", s3Key: "dup", originalFilename: "y" } });
    await expect(
      db.prisma.video.create({ data: { title: "t3", s3Key: "dup", originalFilename: "z" } }),
    ).rejects.toThrow();
  });
});
