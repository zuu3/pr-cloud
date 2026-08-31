"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ko">
      <body>
        <main className="grid min-h-screen place-items-center px-6">
          <div className="text-center">
            <h2 className="text-[22px] font-semibold">문제가 발생했어요</h2>
            <p className="mt-2 text-[15px] text-body">잠시 후 다시 시도해 주세요.</p>
            <button
              onClick={reset}
              className="mt-4 h-11 rounded-lg bg-primary px-4 text-[15px] font-semibold text-white"
            >
              다시 시도
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
