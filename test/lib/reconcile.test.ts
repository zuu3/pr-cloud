import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
// purgeExpiredTrash removed with the cron sweep — only reconcileStuckUploads remains.
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";

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
  });
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  vi.doMock("@/lib/media", () => ({ generateMedia: vi.fn(async () => {}) }));
});
afterAll(async () => {
  await db.stop();
  await m.stop();
});
beforeEach(async () => {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  vi.doMock("@/lib/media", () => ({ generateMedia: vi.fn(async () => {}) }));
  await db.prisma.upload.deleteMany();
  await db.prisma.video.deleteMany();
});

const ago = (ms: number) => new Date(Date.now() - ms);
const MIN = 60_000;
const HOUR = 3_600_000;

async function s3() {
  const { s3Internal, BUCKET } = await import("@/lib/s3");
  return { s3Internal, BUCKET };
}

describe("reconcileStuckUploads", () => {
  it("completes a multipart upload whose parts all landed", async () => {
    const { s3Internal, BUCKET } = await s3();
    const key = `promo-video/rec-${Math.random()}.mp4`;
    const c = await s3Internal.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key }),
    );
    const p1 = Buffer.alloc(1024, 1);
    const p2 = Buffer.alloc(512, 2);
    for (const [n, body] of [
      [1, p1],
      [2, p2],
    ] as const) {
      await s3Internal.send(
        new UploadPartCommand({
          Bucket: BUCKET,
          Key: key,
          UploadId: c.UploadId,
          PartNumber: n,
          Body: body,
        }),
      );
    }
    const v = await db.prisma.video.create({
      data: {
        title: "stuck-mp",
        s3Key: key,
        sizeBytes: BigInt(p1.length + p2.length),
        originalFilename: "a.mp4",
        status: "uploading",
        uploadedBy: "kid@school",
        createdAt: ago(20 * MIN),
        upload: { create: { s3UploadId: c.UploadId!, partSize: 67_108_864 } },
      },
    });

    const { reconcileStuckUploads } = await import("@/lib/reconcile");
    const r = await reconcileStuckUploads();

    expect(r.recovered).toBe(1);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("ready");
    expect(await db.prisma.upload.count({ where: { videoId: v.id } })).toBe(0);
    await expect(
      s3Internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })),
    ).resolves.toBeTruthy();
  });

  it("does not complete a multipart upload that is missing bytes", async () => {
    const { s3Internal, BUCKET } = await s3();
    const key = `promo-video/partial-${Math.random()}.mp4`;
    const c = await s3Internal.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key }),
    );
    await s3Internal.send(
      new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: c.UploadId,
        PartNumber: 1,
        Body: Buffer.alloc(10, 1),
      }),
    );
    const v = await db.prisma.video.create({
      data: {
        title: "partial",
        s3Key: key,
        sizeBytes: BigInt(9_999),
        originalFilename: "a.mp4",
        status: "uploading",
        uploadedBy: "kid@school",
        createdAt: ago(20 * MIN),
        upload: { create: { s3UploadId: c.UploadId!, partSize: 67_108_864 } },
      },
    });

    const { reconcileStuckUploads } = await import("@/lib/reconcile");
    const r = await reconcileStuckUploads();

    expect(r.recovered).toBe(0);
    expect(r.failed).toBe(0);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).status).toBe(
      "uploading",
    );
  });

  it("marks a stale-beyond-24h multipart upload failed", async () => {
    const { s3Internal, BUCKET } = await s3();
    const key = `promo-video/old-${Math.random()}.mp4`;
    const c = await s3Internal.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key }),
    );
    const v = await db.prisma.video.create({
      data: {
        title: "old-mp",
        s3Key: key,
        sizeBytes: BigInt(9_999),
        originalFilename: "a.mp4",
        status: "uploading",
        uploadedBy: "kid@school",
        createdAt: ago(25 * HOUR),
        upload: { create: { s3UploadId: c.UploadId!, partSize: 67_108_864 } },
      },
    });

    const { reconcileStuckUploads } = await import("@/lib/reconcile");
    const r = await reconcileStuckUploads();

    expect(r.failed).toBe(1);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("failed");
    expect(await db.prisma.upload.count({ where: { videoId: v.id } })).toBe(0);
  });

  it("marks a single-PUT upload ready when the object exists", async () => {
    const { s3Internal, BUCKET } = await s3();
    const key = `promo-video/single-${Math.random()}.mp4`;
    await s3Internal.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.alloc(2048, 7) }),
    );
    const v = await db.prisma.video.create({
      data: {
        title: "single",
        s3Key: key,
        sizeBytes: BigInt(2048),
        originalFilename: "a.mp4",
        status: "pending",
        uploadedBy: "kid@school",
        createdAt: ago(20 * MIN),
      },
    });

    const { reconcileStuckUploads } = await import("@/lib/reconcile");
    const r = await reconcileStuckUploads();

    expect(r.recovered).toBe(1);
    const fresh = await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } });
    expect(fresh.status).toBe("ready");
    expect(Number(fresh.sizeBytes)).toBe(2048);
  });

  it("fails a single-PUT upload with no object after 24h", async () => {
    const v = await db.prisma.video.create({
      data: {
        title: "ghost",
        s3Key: `promo-video/ghost-${Math.random()}.mp4`,
        originalFilename: "a.mp4",
        status: "pending",
        uploadedBy: "kid@school",
        createdAt: ago(25 * HOUR),
      },
    });
    const { reconcileStuckUploads } = await import("@/lib/reconcile");
    const r = await reconcileStuckUploads();
    expect(r.failed).toBe(1);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("failed");
  });

  it("leaves recent uploads alone", async () => {
    const v = await db.prisma.video.create({
      data: {
        title: "fresh",
        s3Key: `promo-video/fresh-${Math.random()}.mp4`,
        originalFilename: "a.mp4",
        status: "pending",
        uploadedBy: "kid@school",
        createdAt: ago(1 * MIN),
      },
    });
    const { reconcileStuckUploads } = await import("@/lib/reconcile");
    const r = await reconcileStuckUploads();
    expect(r.scanned).toBe(0);
    expect((await db.prisma.video.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("pending");
  });

  it("scopes the sweep to one user when email is given", async () => {
    for (const email of ["a@school", "b@school"]) {
      await db.prisma.video.create({
        data: {
          title: email,
          s3Key: `promo-video/${email}-${Math.random()}.mp4`,
          originalFilename: "a.mp4",
          status: "pending",
          uploadedBy: email,
          createdAt: ago(25 * HOUR),
        },
      });
    }
    const { reconcileStuckUploads } = await import("@/lib/reconcile");
    const r = await reconcileStuckUploads({ email: "a@school" });
    expect(r.scanned).toBe(1);
    expect(r.failed).toBe(1);
    expect(await db.prisma.video.count({ where: { status: "failed" } })).toBe(1);
  });
});
