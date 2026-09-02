import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { generateMedia } from "@/lib/media";

// Backfill thumbnails + the playable-in-browser flag for videos uploaded
// before those were computed. Runs in the background, capped per call.
// ?transcode=1 instead targets already-flagged non-web-playable videos that
// still have no h264 proxy — transcoding pins a CPU for minutes, so only a
// few per call and only one run at a time (re-clicking while it's busy is a
// no-op), and each item is re-checked so parallel triggers don't double-encode.
let transcodeRunning = false;

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const transcode = new URL(request.url).searchParams.get("transcode") === "1";

    if (transcode) {
      if (transcodeRunning) return json({ queued: 0, running: true });
      const targets = await prisma.video.findMany({
        where: { status: "ready", deletedAt: null, playableInBrowser: false, proxyKey: null },
        orderBy: { createdAt: "desc" },
        select: { id: true },
        take: 3,
      });
      transcodeRunning = true;
      void (async () => {
        try {
          for (const t of targets) {
            const fresh = await prisma.video.findUnique({
              where: { id: t.id },
              select: { proxyKey: true, deletedAt: true },
            });
            if (!fresh || fresh.deletedAt || fresh.proxyKey) continue; // already done elsewhere
            await generateMedia(t.id).catch(() => {});
          }
        } finally {
          transcodeRunning = false;
        }
      })();
      await logAudit(admin.email, "media.transcode", String(targets.length));
      return json({ queued: targets.length });
    }

    const targets = await prisma.video.findMany({
      where: {
        status: "ready",
        deletedAt: null,
        OR: [{ thumbKey: null }, { playableInBrowser: null }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      take: 500,
    });
    void (async () => {
      for (const t of targets) await generateMedia(t.id).catch(() => {});
    })();
    await logAudit(admin.email, "media.regenerate", String(targets.length));
    return json({ queued: targets.length });
  });
}
