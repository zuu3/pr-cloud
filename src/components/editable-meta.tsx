"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function EditableMeta({
  videoId,
  title,
  description,
  canEdit,
}: {
  videoId: string;
  title: string;
  description: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(title);
  const [d, setD] = useState(description ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!t.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/videos/${videoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t.trim(), description: d.trim() || null }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
      toast.show("저장했어요");
    } else toast.show("저장하지 못했어요", "err");
  }

  if (editing) {
    return (
      <div className="mt-3">
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          aria-label="제목"
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[20px] font-bold text-foreground outline-none focus:border-primary focus:bg-canvas"
        />
        <textarea
          value={d}
          onChange={(e) => setD(e.target.value)}
          aria-label="설명"
          placeholder="설명 (선택)"
          rows={3}
          className="mt-2 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] leading-[1.6] text-body outline-none focus:border-primary focus:bg-canvas"
        />
        <div className="mt-2 flex gap-2">
          <Button onClick={save} size="md" loading={busy}>
            저장
          </Button>
          <Button
            onClick={() => {
              setEditing(false);
              setT(title);
              setD(description ?? "");
            }}
            variant="ghost"
            size="md"
          >
            취소
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-start gap-2">
        <h1 className="text-[26px] font-bold leading-[1.35] tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="mt-1.5 shrink-0 rounded-md px-2 py-1 text-[13px] text-muted hover:bg-surface hover:text-body"
          >
            수정
          </button>
        )}
      </div>
      {description && (
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-[1.7] text-body">
          {description}
        </p>
      )}
    </div>
  );
}
