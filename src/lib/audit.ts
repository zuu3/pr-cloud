import { prisma } from "./db";

/** Best-effort audit trail — never blocks or fails the primary action. */
export async function logAudit(
  actor: string | null,
  action: string,
  targetId?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { actorEmail: actor, action, targetId } });
  } catch (e) {
    console.warn("audit log failed", action, e);
  }
}
