import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./db";
import { s3Internal, BUCKET, signInternalGetUrl } from "./s3";
import { extOf } from "./uploads";

const run = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

// codecs + containers a <video> element can play across mainstream browsers
const WEB_VCODECS = new Set(["h264", "vp8", "vp9", "av1"]);
const WEB_CONTAINERS = new Set(["mp4", "m4v", "webm", "ogv", "ogg", "mov"]);

/** null = couldn't tell (leave the flag unknown) */
export function isWebPlayable(vcodec: string | null, ext: string): boolean | null {
  if (!vcodec) return null;
  return WEB_VCODECS.has(vcodec.toLowerCase()) && WEB_CONTAINERS.has(ext.toLowerCase());
}

async function probe(
  url: string,
): Promise<{ duration: number | null; vcodec: string | null }> {
  try {
    const { stdout } = await run(
      FFPROBE,
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", url],
      { timeout: 30_000, maxBuffer: 4 << 20 },
    );
    const j = JSON.parse(stdout);
    const d = Number(j?.format?.duration);
    const v = (j?.streams ?? []).find(
      (s: { codec_type?: string }) => s.codec_type === "video",
    );
    return {
      duration: Number.isFinite(d) && d > 0 ? Math.round(d) : null,
      vcodec: (v?.codec_name as string | undefined) ?? null,
    };
  } catch {
    return { duration: null, vcodec: null };
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
    const { duration, vcodec } = await probe(url);
    const playable = isWebPlayable(vcodec, extOf(video.originalFilename));
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

    if (duration || thumbKey || playable !== null) {
      await prisma.video.update({
        where: { id: videoId },
        data: {
          durationSec: duration ?? undefined,
          thumbKey,
          playableInBrowser: playable ?? undefined,
        },
      });
    }
  } catch (e) {
    console.warn("generateMedia failed", videoId, e);
  }
}
