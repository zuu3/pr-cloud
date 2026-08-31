"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/components/providers";
import { useToast } from "@/components/ui/toast";

const PRESETS = [
  ["0", "만료 없음"],
  ["1", "1일"],
  ["7", "7일"],
  ["30", "30일"],
] as const;

type Link = {
  id: string;
  url: string;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
};

export function SharePanel({ videoId }: { videoId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [days, setDays] = useState("0");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const key = ["shares", videoId];
  const { data } = useQuery<{ links: Link[] }>({
    queryKey: key,
    queryFn: () => apiFetch(`/api/videos/${videoId}/share`),
  });
  const links = data?.links ?? [];

  const createM = useMutation({
    mutationFn: () => {
      const n = Number(days);
      const expiresAt = n > 0 ? new Date(Date.now() + n * 86_400_000).toISOString() : undefined;
      return apiFetch(`/api/videos/${videoId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expiresAt ? { expiresAt } : {}),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const revokeM = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/share/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.show("링크를 해제했어요");
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  async function copy(link: Link) {
    await navigator.clipboard.writeText(link.url);
    setCopiedId(link.id);
    toast.show("링크를 복사했어요");
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <h3 className="text-[15px] font-semibold text-foreground">공유 링크</h3>
      <p className="mt-1 text-[13px] leading-[1.6] text-muted">
        로그인 없이 볼 수 있는 링크를 만들어요.
      </p>

      <div className="mt-3">
        <span className="text-[13px] text-muted">유효 기간</span>
        <div className="mt-1.5 inline-flex rounded-xl border border-border p-0.5">
          {PRESETS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setDays(v)}
              className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                days === v ? "bg-weak-bg text-weak-fg" : "text-body hover:bg-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <Button onClick={() => createM.mutate()} variant="weak" size="md" loading={createM.isPending}>
          공유 링크 만들기
        </Button>
      </div>

      {links.length > 0 && (
        <ul className="mt-4 space-y-2">
          {links.map((l) => (
            <li key={l.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={l.url}
                  aria-label="공유 링크"
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12px] text-body"
                />
                <button
                  onClick={() => copy(l)}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-body hover:border-primary"
                >
                  {copiedId === l.id ? "복사함" : "복사"}
                </button>
                <button
                  onClick={() => revokeM.mutate(l.id)}
                  disabled={revokeM.isPending}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-[12px] text-danger hover:bg-[#fdecee] disabled:opacity-50"
                >
                  해제
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {l.expiresAt
                  ? l.expired
                    ? "만료됨"
                    : `${new Date(l.expiresAt).toLocaleDateString("ko-KR")} 만료`
                  : "만료 없음"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
