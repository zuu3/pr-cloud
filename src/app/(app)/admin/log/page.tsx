import { BackLink } from "@/components/back-link";
import { requireAdmin } from "@/lib/auth";
import { AuditLog } from "@/components/audit-log";

export default async function LogPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 sm:py-12">
      <BackLink href="/admin">계정 관리</BackLink>
      <h1 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-foreground">활동 로그</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-body">
        누가 언제 무엇을 했는지 모두 기록돼요.
      </p>
      <div className="mt-8">
        <AuditLog />
      </div>
    </main>
  );
}
