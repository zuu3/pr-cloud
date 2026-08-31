import { env } from "./env";
import { prisma } from "./db";
import { HttpError } from "./http";

export const PART_SIZE = 67_108_864; // 64 MiB

export const singlePutMax = () => env.SINGLE_PUT_MAX_BYTES;

export const needsMultipart = (size: number) => size > env.SINGLE_PUT_MAX_BYTES;

export const partCount = (size: number) => Math.max(1, Math.ceil(size / PART_SIZE));

export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 || i === filename.length - 1 ? "" : filename.slice(i + 1);
}

/** Verify the caller owns the in-progress multipart upload for (key, uploadId). */
export async function assertUploadOwner(
  key: string,
  uploadId: string,
  email: string,
): Promise<{ videoId: string }> {
  const up = await prisma.upload.findFirst({
    where: { s3UploadId: uploadId, video: { s3Key: key } },
    include: { video: true },
  });
  if (!up) throw new HttpError(404, "upload not found");
  if (up.video.uploadedBy !== email) throw new HttpError(403, "not your upload");
  return { videoId: up.videoId };
}
