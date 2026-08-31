import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { UsersTable } from "./users-table";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, role: true, status: true, name: true },
  });

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 sm:py-12">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.01em] text-foreground">계정 관리</h1>
          <p className="mt-2 text-[15px] leading-[1.6] text-body">
            여기에 등록된 학교 계정만 로그인할 수 있어요.
          </p>
        </div>
        <Link
          href="/admin/log"
          className="mt-1 shrink-0 rounded-lg border border-border bg-canvas px-3 py-1.5 text-[13px] font-medium text-body transition-colors hover:border-primary hover:text-primary"
        >
          활동 로그
        </Link>
      </div>
      <div className="mt-8">
        <AdminPanel />
      </div>
      <div className="mt-6">
        <UsersTable initial={users} />
      </div>
    </main>
  );
}
