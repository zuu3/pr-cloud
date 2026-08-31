import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { mockSession, req, jbody } from "../helpers/req";

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
  await db.prisma.video.deleteMany();
  await db.prisma.folder.deleteMany();
  mockSession({ email: "m@school.ac.kr", role: "member" });
});

describe("folder manage", () => {
  it("renames a folder", async () => {
    const f = await db.prisma.folder.create({ data: { name: "old" } });
    const { PATCH } = await import("@/app/api/folders/[id]/route");
    const r = await PATCH(req(`/api/folders/${f.id}`, jbody({ name: "new" })), {
      params: Promise.resolve({ id: f.id }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).folder.name).toBe("new");
  });

  it("refuses to delete a non-empty folder (409), allows when empty (204)", async () => {
    const f = await db.prisma.folder.create({ data: { name: "f" } });
    const v = await db.prisma.video.create({
      data: { title: "t", s3Key: "k", originalFilename: "a.mp4", status: "ready", folderId: f.id },
    });
    const { DELETE } = await import("@/app/api/folders/[id]/route");
    let r = await DELETE(req(`/api/folders/${f.id}`), { params: Promise.resolve({ id: f.id }) });
    expect(r.status).toBe(409);

    await db.prisma.video.delete({ where: { id: v.id } });
    r = await DELETE(req(`/api/folders/${f.id}`), { params: Promise.resolve({ id: f.id }) });
    expect(r.status).toBe(204);
  });

  it("moves a video into a folder and back to root", async () => {
    const f = await db.prisma.folder.create({ data: { name: "f" } });
    const v = await db.prisma.video.create({
      data: {
        title: "t",
        s3Key: "k",
        originalFilename: "a.mp4",
        status: "ready",
        uploadedBy: "m@school.ac.kr",
      },
    });
    const { PATCH } = await import("@/app/api/videos/[id]/route");
    let r = await PATCH(req(`/api/videos/${v.id}`, jbody({ folderId: f.id })), {
      params: Promise.resolve({ id: v.id }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).video.folderId).toBe(f.id);

    r = await PATCH(req(`/api/videos/${v.id}`, jbody({ folderId: null })), {
      params: Promise.resolve({ id: v.id }),
    });
    expect((await r.json()).video.folderId).toBeNull();
  });
});
