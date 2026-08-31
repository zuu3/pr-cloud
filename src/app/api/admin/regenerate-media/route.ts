import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { generateMedia } from "@/lib/media";

// Backfill thumbnails + the playable-in-browser flag for videos uploaded
// before those were computed. Runs in the background, capped per call.
export async function POST() {
  return handle(async () => {
    const admin = await requireAdmin();
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
      for (const t of targets) {
        await generateMedia(t.id).catch(() => {});
      }
    })();

    await logAudit(admin.email, "media.regenerate", String(targets.length));
    return json({ queued: targets.length });
  });
}
