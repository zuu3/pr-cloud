import { handle, json, HttpError } from "@/lib/http";
import { env } from "@/lib/env";
import { reconcileStuckUploads, purgeExpiredTrash } from "@/lib/reconcile";

/**
 * Called by an out-of-process scheduler (system crontab on the VM), e.g.
 *   * /10 * * * * curl -fsS -XPOST -H "x-cron-secret: $CRON_SECRET" \
 *       http://127.0.0.1:3000/api/cron/sweep
 * Recovers half-finished uploads and hard-deletes trash older than 30 days.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const secret = env.CRON_SECRET;
    if (!secret) throw new HttpError(503, "cron disabled");
    if (request.headers.get("x-cron-secret") !== secret) throw new HttpError(401, "bad secret");

    const swept = await reconcileStuckUploads();
    const purged = await purgeExpiredTrash(30);
    return json({ ...swept, ...purged });
  });
}
