import {
  HeadObjectCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "./db";
import { s3Internal, BUCKET } from "./s3";
import { logAudit } from "./audit";
import { generateMedia } from "./media";

// An upload is "stuck" if it's still pending/uploading this long after it was
// created — the browser tab probably died before /api/uploads/*/complete ran.
const STALE_MINUTES = 10;
// After this long we stop hoping and mark it failed so the uploader sees it.
const GIVE_UP_HOURS = 24;

type Recon = { scanned: number; recovered: number; failed: number };

/**
 * Find uploads whose DB row never reached "ready" and try to finish them from
 * what actually landed in object storage:
 *  - multipart: if every part is present (contiguous, byte totals match the
 *    declared size) → CompleteMultipartUpload and mark ready.
 *  - single PUT: if the object exists → mark ready.
 * Anything older than GIVE_UP_HOURS with nothing usable is marked failed.
 *
 * Pass `email` to limit the sweep to one user (cheap, safe to run on every
 * page load). Omit it for the global cron sweep.
 */
export async function reconcileStuckUploads(opts: { email?: string } = {}): Promise<Recon> {
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000);
  const giveUpBefore = new Date(Date.now() - GIVE_UP_HOURS * 3_600_000);

  const stuck = await prisma.video.findMany({
    where: {
      status: { in: ["pending", "uploading"] },
      createdAt: { lt: staleBefore },
      ...(opts.email ? { uploadedBy: opts.email } : {}),
    },
    include: { upload: true },
  });

  let recovered = 0;
  let failed = 0;

  for (const v of stuck) {
    try {
      if (v.upload) {
        if (await finishMultipart(v)) {
          recovered += 1;
          continue;
        }
      } else if (await objectExists(v.s3Key)) {
        await markReady(v.id, v.uploadedBy, v.s3Key);
        recovered += 1;
        continue;
      }

      // couldn't recover — give up once it's old enough so the uploader sees it
      if (v.createdAt < giveUpBefore) {
        if (v.upload) {
          await s3Internal
            .send(
              new AbortMultipartUploadCommand({
                Bucket: BUCKET,
                Key: v.s3Key,
                UploadId: v.upload.s3UploadId,
              }),
            )
            .catch(() => {});
          await prisma.upload.deleteMany({ where: { videoId: v.id } });
        }
        await prisma.video.update({ where: { id: v.id }, data: { status: "failed" } });
        await logAudit(v.uploadedBy, "upload.failed", v.id);
        failed += 1;
      }
    } catch (e) {
      console.warn("reconcile: skipped", v.id, e);
    }
  }

  return { scanned: stuck.length, recovered, failed };
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3Internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function markReady(videoId: string, actor: string | null, key: string) {
  const head = await s3Internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  await prisma.video.update({
    where: { id: videoId },
    data: { status: "ready", sizeBytes: BigInt(head.ContentLength ?? 0) },
  });
  await logAudit(actor, "upload.recovered", videoId);
  void generateMedia(videoId).catch(() => {});
}

/** Returns true only if it actually completed the multipart upload. */
async function finishMultipart(v: {
  id: string;
  s3Key: string;
  uploadedBy: string | null;
  sizeBytes: bigint | null;
  upload: { s3UploadId: string } | null;
}): Promise<boolean> {
  if (!v.upload) return false;
  const out = await s3Internal
    .send(new ListPartsCommand({ Bucket: BUCKET, Key: v.s3Key, UploadId: v.upload.s3UploadId }))
    .catch(() => null);
  const parts = out?.Parts ?? [];
  if (parts.length === 0 || v.sizeBytes == null) return false;

  const nums = parts.map((p) => p.PartNumber ?? 0).sort((a, b) => a - b);
  const contiguous = nums.every((n, i) => n === i + 1);
  const total = parts.reduce((s, p) => s + (p.Size ?? 0), 0);
  if (!contiguous || total !== Number(v.sizeBytes)) return false;

  await s3Internal.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: v.s3Key,
      UploadId: v.upload.s3UploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0))
          .map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
      },
    }),
  );
  const head = await s3Internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: v.s3Key }));
  await prisma.$transaction([
    prisma.video.update({
      where: { id: v.id },
      data: { status: "ready", sizeBytes: BigInt(head.ContentLength ?? 0) },
    }),
    prisma.upload.delete({ where: { videoId: v.id } }),
  ]);
  await logAudit(v.uploadedBy, "upload.recovered", v.id);
  void generateMedia(v.id).catch(() => {});
  return true;
}

/**
 * Hard-delete videos that have sat in the trash longer than `days`. Runs from
 * the cron sweep. Objects gone from storage, rows gone from the DB.
 */
export async function purgeExpiredTrash(days = 30): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const videos = await prisma.video.findMany({ where: { deletedAt: { lt: cutoff } } });
  if (videos.length === 0) return { purged: 0 };

  const keys = videos.flatMap((v) => [v.s3Key, v.thumbKey].filter(Boolean) as string[]);
  for (let i = 0; i < keys.length; i += 1000) {
    await s3Internal
      .send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      )
      .catch(() => {});
  }
  await prisma.video.deleteMany({ where: { id: { in: videos.map((v) => v.id) } } });
  await logAudit(null, "trash.autopurge", videos.map((v) => v.id).join(","));
  return { purged: videos.length };
}
