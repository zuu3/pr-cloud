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
  const [downloading, setDownloading] = useState(false);
  const [trashing, setTrashing] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/url?disposition=attachment`);
      if (res.ok) window.location.href = (await res.json()).url;
      else toast.show("다운로드 링크를 만들지 못했어요", "err");
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  }

  async function trash() {
    const ok = await dialog.confirm({
      title: "영상을 삭제할까요?",
      body: "휴지통으로 옮겨요. 나중에 되살릴 수 있어요.",
      danger: true,
      confirmText: "삭제",
    });
    if (!ok) return;
    setTrashing(true);
    const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    if (res.status === 204) {
      toast.show("휴지통으로 옮겼어요");
      router.push("/");
    } else {
      setTrashing(false);
      toast.show("삭제하지 못했어요", "err");
    }
  }

  return (
    <div className="mt-5 flex gap-2">
      <Button onClick={download} size="md" loading={downloading}>
        다운로드
      </Button>
      {canManage && (
        <Button onClick={trash} variant="danger" size="md" loading={trashing}>
          삭제
        </Button>
      )}
    </div>
  );
}
