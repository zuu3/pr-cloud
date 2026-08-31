"use client";

import { useState } from "react";

export function SharePanel({ videoId }: { videoId: string }) {
  const [expiresAt, setExpiresAt] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    const res = await fetch(`/api/videos/${videoId}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(d.error ?? "링크를 만들지 못했어요");
    setLink(d.url);
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="text-[16px] font-semibold text-foreground">공유</h3>
      <p className="mt-1 text-[13px] text-muted">
        로그인 없이 볼 수 있는 링크를 만들어요. 만료 시각은 선택이에요.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-[13px] text-body">
          만료(선택)&nbsp;
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-md border border-border bg-canvas px-2 py-1 text-[13px]"
          />
        </label>
        <button
          onClick={create}
          className="h-10 rounded-lg bg-weak-bg px-4 text-[14px] font-semibold text-weak-fg"
        >
          공유 링크 만들기
        </button>
      </div>

      {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}

      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={link}
            aria-label="공유 링크"
            className="h-10 w-[28rem] max-w-full rounded-lg border border-border bg-surface px-3 text-[13px]"
          />
          <button
            onClick={copy}
            className="h-10 rounded-lg border border-border bg-canvas px-3 text-[13px] text-body hover:border-primary"
          >
            {copied ? "복사했어요" : "복사"}
          </button>
        </div>
      )}
    </div>
  );
}
