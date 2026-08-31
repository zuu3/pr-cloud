import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { env } from "@/lib/env";

// Lightweight usage percentage for the space-almost-full banner. Any signed-in
// user; returns { pct: null } when no STORAGE_QUOTA_BYTES is configured.
export async function GET() {
  return handle(async () => {
    await requireUser();
    const quota = env.STORAGE_QUOTA_BYTES ?? null;
    if (!quota) return json({ pct: null });

    const agg = await prisma.video.aggregate({
      _sum: { sizeBytes: true },
      where: { deletedAt: null, status: "ready" },
    });
    const usedBytes = Number(agg._sum.sizeBytes ?? 0n);
    return json({ pct: Math.round((usedBytes / quota) * 100), usedBytes, quota });
  });
}
