import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import {
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "./db";
import { env } from "./env";
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
 * Transcode a non-web-playable source to a fragmented h264/aac mp4 and stream it
 * straight to S3 as the video's proxy — ffmpeg writes to stdout, we multipart-
 * upload the pipe in ~8 MB parts, so nothing large ever touches local disk (the
 * VM has almost none). Heavy (minutes); runs only from the background job for
 * sources under PROXY_MAX_SOURCE_BYTES. Returns the proxy key or null.
 */
const PART_SIZE = 8 << 20; // 8 MiB

async function buildProxy(videoId: string, srcUrl: string): Promise<string | null> {
  const key = `promo-video/proxy/${videoId}.mp4`;
  const ffArgs = [
    "-nostdin",
    "-threads", "1", // leave a core for the web server on this 2-vCPU box
    "-i", srcUrl,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "160k",
    // fragmented mp4 so a non-seekable pipe still produces a streamable file
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1",
  ];
  // run niced so a transcode never starves request handling
  const ff = spawn("nice", ["-n", "19", FFMPEG, ...ffArgs]);
  let stderr = "";
  ff.stderr.on("data", (d) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });

  const kill = setTimeout(() => ff.kill("SIGKILL"), 30 * 60_000);
  let uploadId: string | undefined;
  try {
    const created = await s3Internal.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: "video/mp4" }),
    );
    uploadId = created.UploadId!;
    const parts: { ETag: string; PartNumber: number }[] = [];
    let buf: Buffer[] = [];
    let buffered = 0;
    let partNo = 0;

    const flush = async () => {
      if (buffered === 0) return;
      const body = Buffer.concat(buf, buffered);
      buf = [];
      buffered = 0;
      partNo += 1;
      const r = await s3Internal.send(
        new UploadPartCommand({
          Bucket: BUCKET,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNo,
          Body: body,
        }),
      );
      parts.push({ ETag: r.ETag!, PartNumber: partNo });
    };

    for await (const chunk of ff.stdout as AsyncIterable<Buffer>) {
      buf.push(chunk);
      buffered += chunk.length;
      if (buffered >= PART_SIZE) await flush();
    }
    const [code] = (await once(ff, "close")) as [number];
    if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${stderr.split("\n").pop()}`);
    await flush();
    if (parts.length === 0) throw new Error("ffmpeg produced no output");

    await s3Internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
    return key;
  } catch (e) {
    console.warn("buildProxy failed", videoId, e);
    if (uploadId) {
      await s3Internal
        .send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }))
        .catch(() => {});
    }
    return null;
  } finally {
    clearTimeout(kill);
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

    // a photo is its own thumbnail — no ffmpeg
    if (video.kind === "image") {
      await prisma.video.update({
        where: { id: videoId },
        data: { thumbKey: video.s3Key, playableInBrowser: true },
      });
      return;
    }

    const url = await signInternalGetUrl(video.s3Key, 6 * 3600);
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

    // non-web-playable source → try to build an h264 proxy so it plays in-browser
    const cap = env.PROXY_MAX_SOURCE_BYTES;
    const srcBytes = video.sizeBytes == null ? null : Number(video.sizeBytes);
    if (playable === false && cap > 0 && (srcBytes == null || srcBytes <= cap)) {
      const proxyKey = await buildProxy(videoId, url);
      if (proxyKey) {
        await prisma.video.update({
          where: { id: videoId },
          data: { proxyKey, playableInBrowser: true },
        });
      }
    }
  } catch (e) {
    console.warn("generateMedia failed", videoId, e);
  }
}
