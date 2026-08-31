"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function SharePanel({ videoId }: { videoId: string }) {
  const toast = useToast();
  const [expiresAt, setExpiresAt] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setErr(null);
    setBusy(true);
    const res = await fetch(`/api/videos/${videoId}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(d.error ?? "링크를 만들지 못했어요");
    setLink(d.url);
  }

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
        로그인 없이 볼 수 있는 링크를 만들어요. 만료 시각은 선택이에요.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          aria-label="만료 시각"
          className="h-10 rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-primary focus:bg-canvas"
        />
        <Button onClick={create} variant="weak" size="md" loading={busy}>
          공유 링크 만들기
        </Button>
      </div>

      {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}

      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link}
            aria-label="공유 링크"
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
