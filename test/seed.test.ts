import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("../src/lib/db", () => ({ prisma: db.prisma }));
  process.env.SEED_ADMIN_EMAIL = "admin@school.ac.kr";
  process.env.DATABASE_URL = db.url;
});
afterAll(async () => {
  await db.stop();
});

describe("seedAdmin", () => {
  it("creates the seed admin once, idempotent", async () => {
    const { seedAdmin } = await import("../src/lib/seed");
    await seedAdmin();
    await seedAdmin();
    const rows = await db.prisma.user.findMany({ where: { email: "admin@school.ac.kr" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
  });
});
