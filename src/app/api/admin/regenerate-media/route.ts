import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { generateMedia } from "@/lib/media";

// Backfill thumbnails + the playable-in-browser flag for videos uploaded
// before those were computed. Runs in the background, capped per call.
// ?transcode=1 instead targets already-flagged non-web-playable videos that
// still have no h264 proxy — transcoding is heavy, so the cap is much smaller.
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const transcode = new URL(request.url).searchParams.get("transcode") === "1";
    const targets = await prisma.video.findMany({
      where: transcode
        ? { status: "ready", deletedAt: null, playableInBrowser: false, proxyKey: null }
        : {
            status: "ready",
            deletedAt: null,
            OR: [{ thumbKey: null }, { playableInBrowser: null }],
          },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      take: transcode ? 20 : 500,
    });

    void (async () => {
      for (const t of targets) {
        await generateMedia(t.id).catch(() => {});
      }
    })();

    await logAudit(
      admin.email,
      transcode ? "media.transcode" : "media.regenerate",
      String(targets.length),
    );
    return json({ queued: targets.length });
  });
}
