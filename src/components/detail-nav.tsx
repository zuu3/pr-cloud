"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// prev = newer sibling, next = older sibling (list is createdAt desc)
export function DetailNav({
  prevId,
  nextId,
}: {
  prevId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key === "ArrowLeft" && prevId) router.push(`/v/${prevId}`);
      if (e.key === "ArrowRight" && nextId) router.push(`/v/${nextId}`);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [prevId, nextId, router]);

  if (!prevId && !nextId) return null;

  const cls =
    "flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-body hover:border-primary hover:text-primary";
  return (
    <div className="mt-4 flex items-center justify-between">
      {prevId ? (
        <Link href={`/v/${prevId}`} className={cls}>
          ← 이전
        </Link>
      ) : (
        <span />
      )}
      {nextId ? (
        <Link href={`/v/${nextId}`} className={cls}>
          다음 →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
