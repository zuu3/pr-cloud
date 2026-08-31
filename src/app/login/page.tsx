import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const s = await auth();
  if (s?.user?.email) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-[30px] font-bold text-foreground">홍보부 영상 클라우드</h1>
        <p className="mt-2 text-[15px] text-body">
          촬영한 영상을 올리고, 필요한 사람에게 링크로 전달해요.
        </p>
        {error && (
          <p className="mt-4 rounded-lg bg-weak-bg px-3 py-2 text-[14px] text-danger">
            접근 권한이 없어요. 관리자에게 문의해 주세요.
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="h-12 w-full rounded-2xl bg-primary text-[16px] font-semibold text-white hover:bg-primary-hover">
            학교 Google 계정으로 로그인
          </button>
        </form>
      </div>
    </main>
  );
}
