import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { generateMedia } from "@/lib/media";

// New uploads get their thumbnail / playable flag / h264 proxy automatically
// via generateMedia. This endpoint is only for backfilling videos that
// predate those.
//
// ?transcode=1 drains the whole "needs a browser proxy" backlog: one call
// walks every non-web-playable video with no proxy, one at a time (ffmpeg is
// niced + single-thread), then stops. Only one drain runs at a time — calling
// again while it's working is a no-op.
let draining = false;

async function drainTranscodeBacklog() {
  // hard ceiling so a bug can't loop forever; the admin can re-run to continue
  for (let done = 0; done < 300; done += 1) {
    const next = await prisma.video.findFirst({
      where: { status: "ready", deletedAt: null, playableInBrowser: false, proxyKey: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!next) return done;
    await generateMedia(next.id).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000)); // breathe between clips
  }
  return 300;
}

// live status for the admin panel: how many still need a proxy, and whether
// a drain is currently working through them.
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const pending = await prisma.video.count({
      where: { status: "ready", deletedAt: null, playableInBrowser: false, proxyKey: null },
    });
    return json({ pending, draining });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const transcode = new URL(request.url).searchParams.get("transcode") === "1";

    if (transcode) {
      const pending = await prisma.video.count({
        where: { status: "ready", deletedAt: null, playableInBrowser: false, proxyKey: null },
      });
      if (draining) return json({ pending, running: true });
      draining = true;
      void drainTranscodeBacklog()
        .catch(() => {})
        .finally(() => {
          draining = false;
        });
      await logAudit(admin.email, "media.transcode", String(pending));
      return json({ pending, running: true });
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
