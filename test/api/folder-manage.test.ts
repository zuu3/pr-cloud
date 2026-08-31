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

  it("recursively deletes a folder: subfolders gone, videos trashed", async () => {
    const parent = await db.prisma.folder.create({ data: { name: "parent" } });
    const child = await db.prisma.folder.create({ data: { name: "child", parentId: parent.id } });
    const v1 = await db.prisma.video.create({
      data: { title: "a", s3Key: "ka", originalFilename: "a.mp4", status: "ready", folderId: parent.id },
    });
    const v2 = await db.prisma.video.create({
      data: { title: "b", s3Key: "kb", originalFilename: "b.mp4", status: "ready", folderId: child.id },
    });

    const routes = await import("@/app/api/folders/[id]/route");
    const info = await (
      await routes.GET(req(`/api/folders/${parent.id}`), { params: Promise.resolve({ id: parent.id }) })
    ).json();
    expect(info.subfolderCount).toBe(1);
    expect(info.videoCount).toBe(2);

    const r = await routes.DELETE(req(`/api/folders/${parent.id}`), {
      params: Promise.resolve({ id: parent.id }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ deletedFolders: 2, trashedVideos: 2 });

    expect(await db.prisma.folder.count()).toBe(0);
    for (const v of [v1, v2]) {
      const row = await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.folderId).toBeNull(); // SetNull on folder delete
    }
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
