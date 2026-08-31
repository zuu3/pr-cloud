"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="mt-5 flex gap-2">
      <Button onClick={download} size="md">
        다운로드
      </Button>
      {canManage && (
        <Button onClick={remove} variant="danger" size="md" loading={busy}>
          영상 삭제
        </Button>
      )}
    </div>
  );
}
