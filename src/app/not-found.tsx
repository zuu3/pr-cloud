import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-[15px] text-muted">찾는 페이지가 없어요.</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-hover"
        >
          보관함으로
        </Link>
      </div>
    </main>
  );
}
