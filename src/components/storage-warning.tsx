"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/components/providers";

export function StorageWarning() {
  const { data } = useQuery<{ pct: number | null }>({
    queryKey: ["storage-usage"],
    queryFn: () => apiFetch("/api/storage/usage"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const pct = data?.pct ?? 0;
  if (pct < 90) return null;
  const full = pct >= 100;

  return (
    <div
      className={`border-b px-6 py-2.5 text-center text-[13px] font-medium ${
        full
          ? "border-danger/30 bg-[#fdecee] text-danger"
          : "border-[#e8b800]/40 bg-[#fff9e6] text-foreground"
      }`}
    >
      저장 공간이 {full ? "가득 찼어요" : `거의 찼어요 (${pct}%)`}. 관리자에게 공간 확보를 요청하세요.
    </div>
  );
}
