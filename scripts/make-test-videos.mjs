// Generate synthetic test videos with ffmpeg. No downloads.
//   node scripts/make-test-videos.mjs [count] [sizeMB] [outDir]
//   node scripts/make-test-videos.mjs 3 120        -> 3 files ~120 MB each
//   node scripts/make-test-videos.mjs 1 500 ./big  -> 1 file ~500 MB
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);

const count = Number(process.argv[2] ?? 3);
const sizeMB = Number(process.argv[3] ?? 120);
const outDir = process.argv[4] ?? "./test-videos";
const durSec = 20; // fixed; bitrate is scaled to hit the target size

mkdirSync(outDir, { recursive: true });

// target bytes ≈ (videoBitrate + audioBitrate) * dur / 8
const audioKbps = 128;
const videoKbps = Math.max(500, Math.round((sizeMB * 8192) / durSec - audioKbps));

console.log(
  `generating ${count} × ~${sizeMB}MB (${durSec}s @ ${videoKbps}kbps) into ${outDir}/`,
);

for (let i = 1; i <= count; i++) {
  const out = join(outDir, `test-${String(i).padStart(2, "0")}-${sizeMB}mb.mp4`);
  await run(
    "ffmpeg",
    [
      "-y",
      // per-pixel noise = near-incompressible, so x264 actually hits the target bitrate
      "-f", "lavfi",
      "-i", `nullsrc=size=1280x720:rate=30:duration=${durSec},format=yuv420p,noise=alls=90:allf=t+u`,
      "-f", "lavfi", "-i", `sine=frequency=${300 + i * 40}:duration=${durSec}`,
      "-c:v", "libx264", "-preset", "ultrafast",
      "-b:v", `${videoKbps}k`, "-minrate", `${videoKbps}k`, "-maxrate", `${videoKbps}k`,
      "-bufsize", `${videoKbps * 2}k`,
      "-c:a", "aac", "-b:a", `${audioKbps}k`,
      "-movflags", "+faststart",
      out,
    ],
    { maxBuffer: 1 << 24 },
  );
  const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`  ${out}  (${mb} MB)`);
}
console.log("done. drag these into the upload page.");
