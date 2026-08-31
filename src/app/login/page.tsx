import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const s = await auth();
  if (s?.user?.email) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="w-full max-w-[360px]">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-weak-bg text-[22px]">
          🎬
        </div>
        <h1 className="mt-6 text-[30px] font-bold leading-[1.3] tracking-[-0.01em] text-foreground">
          홍보부 영상,
          <br />한곳에 모아요
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-body">
          촬영한 영상을 올리고, 필요한 사람에게 링크 하나로 전달해요.
        </p>

        {error && (
          <p className="mt-6 rounded-lg bg-[#fdecee] px-3.5 py-2.5 text-[13px] leading-[1.5] text-danger">
            접근 권한이 없어요. 관리자에게 문의해 주세요.
          </p>
        )}

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" size="lg" className="w-full">
            학교 Google 계정으로 로그인
          </Button>
        </form>

        <p className="mt-4 text-center text-[12px] text-muted">
          bssm.hs.kr 계정만 로그인할 수 있어요
        </p>
      </div>
    </main>
  );
}
