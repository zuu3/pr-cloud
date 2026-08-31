"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FolderPicker } from "@/components/folder-picker";
import { apiFetch } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import type { FolderNode } from "@/lib/folders";

export function MoveToFolder({
  videoId,
  folders,
  current,
}: {
  videoId: string;
  folders: FolderNode[];
  current: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(current ?? "");

  const moveM = useMutation({
    mutationFn: (folderId: string) =>
      apiFetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: folderId || null }),
      }),
    onMutate: (folderId) => {
      const prev = value;
      setValue(folderId);
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) setValue(ctx.prev);
      toast.show(e.message, "err");
    },
    onSuccess: () => {
      router.refresh();
      toast.show("폴더를 옮겼어요");
    },
  });

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[13px] font-medium text-body">폴더</span>
      <FolderPicker
        folders={folders}
        value={value}
        disabled={moveM.isPending}
        onChange={(id) => moveM.mutate(id)}
        className="w-[260px] max-w-full"
      />
    </div>
  );
}
