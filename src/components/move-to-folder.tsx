"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/components/providers";
import { useToast } from "@/components/ui/toast";

type Folder = { id: string; name: string };

export function MoveToFolder({
  videoId,
  folders,
  current,
}: {
  videoId: string;
  folders: Folder[];
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
    <label className="flex items-center gap-2 text-[13px] font-medium text-body">
      폴더
      <Select
        aria-label="폴더 선택"
        value={value}
        disabled={moveM.isPending}
        onChange={(e) => moveM.mutate(e.target.value)}
        className="h-10 text-[14px]"
      >
        <option value="">보관함 루트</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
