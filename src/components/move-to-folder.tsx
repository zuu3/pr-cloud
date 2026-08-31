"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);

  async function move(folderId: string) {
    setBusy(true);
    const res = await fetch(`/api/videos/${videoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: folderId || null }),
    });
    setBusy(false);
    if (res.ok) {
      setValue(folderId);
      router.refresh();
    } else {
      alert("옮기지 못했어요");
    }
  }

  return (
    <label className="text-[13px] text-body">
      폴더&nbsp;
      <select
        value={value}
        disabled={busy}
        onChange={(e) => move(e.target.value)}
        className="rounded-md border border-border bg-canvas px-2 py-1 text-[13px]"
      >
        <option value="">(루트)</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}
