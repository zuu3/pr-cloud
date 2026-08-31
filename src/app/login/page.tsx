import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

function GoogleG() {
  return (
    <svg className="size-[18px]" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17Z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7Z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.94 4.34 14.12l7.35 5.7C13.42 14.62 18.27 10.75 24 10.75Z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const s = await auth();
  if (s?.user?.email) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-surface px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative w-full max-w-[380px] rounded-3xl border border-border bg-canvas p-8 shadow-[0_24px_64px_-24px_rgba(25,31,40,0.25)]">
        <h1 className="text-[26px] font-bold tracking-[-0.01em] text-foreground">홍보부 클라우드</h1>
        <p className="mt-2 text-[14px] text-muted">촬영본 모아두는 곳. 이제 영상 날리지 말자.</p>

        {error && (
          <p className="mt-6 rounded-xl bg-[#fdecee] px-3.5 py-2.5 text-[13px] leading-[1.5] text-danger">
            접근 권한이 없어요. 관리자에게 문의해 주세요.
          </p>
        )}

        <form
          className="mt-7"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-border bg-canvas text-[15px] font-semibold text-foreground transition-colors hover:border-primary hover:bg-surface active:scale-[0.98]">
            <GoogleG />
            학교 Google 계정으로 로그인
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-muted">
          <span className="rounded-md bg-surface px-1.5 py-0.5 font-medium">bssm.hs.kr</span>{" "}
          계정만 가능해요
        </p>
      </div>
    </main>
  );
}
