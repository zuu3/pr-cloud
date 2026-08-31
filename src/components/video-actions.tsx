"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VideoActions({ videoId, canManage }: { videoId: string; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    const res = await fetch(`/api/videos/${videoId}/url?disposition=attachment`);
    if (res.ok) window.location.href = (await res.json()).url;
  }

  async function remove() {
    if (!confirm("이 영상을 삭제할까요? 되돌릴 수 없어요.")) return;
    setBusy(true);
    const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    setBusy(false);
    if (res.status === 204) router.push("/");
    else alert("삭제하지 못했어요");
  }

  return (
    <div className="mt-4 flex gap-2">
      <button
        onClick={download}
        className="h-10 rounded-lg bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-hover"
      >
        다운로드
      </button>
      {canManage && (
        <button
          onClick={remove}
          disabled={busy}
          className="h-10 rounded-lg px-4 text-[14px] text-danger hover:bg-[#fdecee] disabled:opacity-40"
        >
          영상 삭제
        </button>
      )}
    </div>
  );
}
