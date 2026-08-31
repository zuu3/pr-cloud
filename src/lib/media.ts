import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./db";
import { s3Internal, BUCKET, signInternalGetUrl } from "./s3";

const run = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

async function probeDuration(url: string): Promise<number | null> {
  try {
    const { stdout } = await run(
      FFPROBE,
      ["-v", "quiet", "-print_format", "json", "-show_format", url],
      { timeout: 30_000, maxBuffer: 1 << 20 },
    );
    const d = JSON.parse(stdout)?.format?.duration;
    const n = Number(d);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  } catch {
    return null;
  }
}

async function grabPoster(url: string, atSec: number): Promise<Buffer | null> {
  try {
    const { stdout } = await run(
      FFMPEG,
      [
        "-y",
        "-ss", String(atSec),
        "-i", url,
        "-frames:v", "1",
        "-vf", "scale=640:-2",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "pipe:1",
      ],
      { timeout: 45_000, maxBuffer: 8 << 20, encoding: "buffer" },
    );
    const buf = stdout as unknown as Buffer;
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort: extract duration + a poster frame for a ready video and persist
 * them. Never throws — the video is fully usable without a thumbnail.
 * ffmpeg reads the object over a ranged HTTP GET, so it only pulls a few MB.
 */
export async function generateMedia(videoId: string): Promise<void> {
  try {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== "ready") return;

    const url = await signInternalGetUrl(video.s3Key);
    const duration = await probeDuration(url);
    const at = duration ? Math.min(3, Math.max(0, Math.floor(duration / 2))) : 1;
    const poster = await grabPoster(url, at);

    let thumbKey: string | undefined;
    if (poster) {
      thumbKey = `promo-video/thumb/${videoId}.jpg`;
      await s3Internal.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: thumbKey,
          Body: poster,
          ContentType: "image/jpeg",
        }),
      );
    }

    if (duration || thumbKey) {
      await prisma.video.update({
        where: { id: videoId },
        data: { durationSec: duration ?? undefined, thumbKey },
      });
    }
  } catch (e) {
    console.warn("generateMedia failed", videoId, e);
  }
}
