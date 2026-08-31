import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { reconcileStuckUploads } from "@/lib/reconcile";

/** Manual global sweep of half-finished uploads (replaces the removed cron). */
export async function POST() {
  return handle(async () => {
    const admin = await requireAdmin();
    const r = await reconcileStuckUploads();
    await logAudit(admin.email, "upload.reconcile", `recovered ${r.recovered}, failed ${r.failed}`);
    return json(r);
  });
}
