"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function VideoActions({ videoId, canManage }: { videoId: string; canManage: boolean }) {
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    const res = await fetch(`/api/videos/${videoId}/url?disposition=attachment`);
    if (res.ok) window.location.href = (await res.json()).url;
    else toast.show("다운로드 링크를 만들지 못했어요", "err");
  }

  async function trash() {
    const ok = await dialog.confirm({
      title: "영상을 삭제할까요?",
      body: "휴지통으로 옮겨요. 나중에 되살릴 수 있어요.",
      danger: true,
      confirmText: "삭제",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    setBusy(false);
    if (res.status === 204) {
      toast.show("휴지통으로 옮겼어요");
      router.push("/");
    } else toast.show("삭제하지 못했어요", "err");
  }

  return (
    <div className="mt-5 flex gap-2">
      <Button onClick={download} size="md">
        다운로드
      </Button>
      {canManage && (
        <Button onClick={trash} variant="danger" size="md" loading={busy}>
          삭제
        </Button>
      )}
    </div>
  );
}
