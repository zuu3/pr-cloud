import Link from "next/link";
import { signOut } from "@/lib/auth";

export function Nav({ user }: { user: { email: string; role: "member" | "admin" } }) {
  return (
    <header className="border-b border-border bg-canvas">
      <div className="mx-auto flex max-w-[1120px] items-center gap-6 px-6 py-3 text-[15px]">
        <Link href="/" className="text-[17px] font-semibold text-foreground">
          홍보부 영상
        </Link>
        <Link href="/upload" className="text-body hover:text-foreground">
          업로드
        </Link>
        {user.role === "admin" && (
          <Link href="/admin" className="text-body hover:text-foreground">
            계정관리
          </Link>
        )}
        <span className="ml-auto text-[14px] text-muted">{user.email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="text-[14px] text-body hover:text-foreground hover:underline">
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
