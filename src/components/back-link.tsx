import Link from "next/link";

export function BackLink({ href = "/", children = "보관함" }: { href?: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[13px] font-medium text-body transition-colors hover:border-primary hover:text-primary"
    >
      <svg className="size-4" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}
