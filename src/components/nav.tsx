"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export function Nav({ user }: { user: { email: string; role: "member" | "admin" } }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-1 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/"
          className="mr-2 flex shrink-0 items-center gap-2 text-[16px] font-bold tracking-[-0.01em] text-foreground sm:mr-4"
        >
          홍보부 클라우드
        </Link>

        <NavLink href="/">보관함</NavLink>
        <NavLink href="/upload">업로드</NavLink>
        {user.role === "admin" && <NavLink href="/admin">계정관리</NavLink>}

        <span className="ml-auto hidden text-[13px] text-muted md:inline">{user.email}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface hover:text-body md:ml-2"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors ${
        active ? "bg-surface text-foreground" : "text-body hover:bg-surface hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
