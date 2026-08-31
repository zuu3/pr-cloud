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
    <main className="mx-auto max-w-[1120px] px-6 py-8">
      <h2 className="text-[24px] font-semibold">접근 허용 계정</h2>
      <p className="mb-6 mt-1 text-[14px] text-muted">
        여기에 등록된 학교 계정만 로그인할 수 있어요.
      </p>
      <UsersTable initial={users} />
    </main>
  );
}
