import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { UsersTable } from "./users-table";

export default async function AdminPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, role: true, status: true, name: true },
  });

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 sm:py-12">
      <h1 className="text-[28px] font-bold tracking-[-0.01em] text-foreground">계정 관리</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-body">
        여기에 등록된 학교 계정만 로그인할 수 있어요.
      </p>
      <div className="mt-8">
        <UsersTable initial={users} />
      </div>
    </main>
  );
}
