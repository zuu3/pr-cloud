"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-[520px] place-items-center px-6 text-center">
      <div>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-surface text-[24px]">
          ⚠️
        </div>
        <h2 className="mt-4 text-[18px] font-bold text-foreground">문제가 생겼어요</h2>
        <p className="mt-1 text-[14px] text-body">잠시 후 다시 시도해 주세요.</p>
        <Button onClick={reset} size="md" className="mt-5">
          다시 시도
        </Button>
      </div>
    </main>
  );
}
