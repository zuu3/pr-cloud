import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => {
  await db.stop();
});

describe("logAudit", () => {
  it("writes a row", async () => {
    const { logAudit } = await import("../src/lib/audit");
    await logAudit("a@school.ac.kr", "upload", "vid-1");
    const rows = await db.prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorEmail: "a@school.ac.kr",
      action: "upload",
      targetId: "vid-1",
    });
  });

  it("swallows db errors", async () => {
    const { logAudit } = await import("../src/lib/audit");
    const spy = vi
      .spyOn(db.prisma.auditLog, "create")
      .mockRejectedValueOnce(new Error("x"));
    await expect(logAudit(null, "delete")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
