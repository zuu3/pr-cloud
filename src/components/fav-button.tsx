"use client";

import { useState } from "react";
import { apiFetch } from "@/components/providers";
import { useToast } from "@/components/ui/toast";

export function FavButton({ videoId, initial }: { videoId: string; initial: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      await apiFetch(`/api/videos/${videoId}/favorite`, { method: next ? "PUT" : "DELETE" });
    } catch (e) {
      setOn(!next);
      toast.show((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${
        on
          ? "border-amber-400 text-amber-500"
          : "border-border text-muted hover:border-primary hover:text-primary"
      }`}
    >
      <span className="text-[14px] leading-none">{on ? "★" : "☆"}</span>
      즐겨찾기
    </button>
  );
}
