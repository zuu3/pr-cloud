"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/components/providers";
import { useToast } from "@/components/ui/toast";

const PRESETS = [
  ["0", "만료 없음"],
  ["1", "1일"],
  ["7", "7일"],
  ["30", "30일"],
] as const;

export function SharePanel({ videoId }: { videoId: string }) {
  const toast = useToast();
  const [days, setDays] = useState("0");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    onSuccess: (d) => setLink(d.url),
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.show("링크를 복사했어요");
    setTimeout(() => setCopied(false), 1500);
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

      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link}
            aria-label="공유 링크"
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-[13px] text-body"
          />
          <Button onClick={copy} variant="ghost" size="md" className="border border-border">
            {copied ? "복사했어요" : "복사"}
          </Button>
        </div>
      )}
    </div>
  );
}
