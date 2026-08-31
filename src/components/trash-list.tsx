"use client";

import { useState } from "react";
import Link from "next/link";
import { humanSize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Row = { id: string; title: string; sizeBytes: number | null; createdAt: string };

export function TrashList({ initial }: { initial: Row[] }) {
  const dialog = useDialog();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(initial);

  async function bulk(action: "restore" | "purge", ids: string[]) {
    const res = await fetch("/api/videos/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    if (!res.ok) return toast.show("작업에 실패했어요", "err");
    const { count } = await res.json();
    setRows((x) => x.filter((r) => !ids.includes(r.id)));
    toast.show(action === "restore" ? `${count}개를 되살렸어요` : `${count}개를 삭제했어요`);
  }

  async function emptyTrash() {
    const ok = await dialog.confirm({
      title: "휴지통을 비울까요?",
      body: `${rows.length}개 영상을 저장소에서 영구히 지워요. 되돌릴 수 없어요.`,
      danger: true,
      confirmText: "휴지통 비우기",
    });
    if (ok) void bulk("purge", rows.map((r) => r.id));
  }

  async function purgeOne(r: Row) {
    const ok = await dialog.confirm({
      title: "완전히 삭제할까요?",
      body: `'${r.title}'을(를) 저장소에서 영구히 지워요.`,
      danger: true,
      confirmText: "영구 삭제",
    });
    if (ok) void bulk("purge", [r.id]);
  }

  if (rows.length === 0) {
    return (
      <div className="mt-20 flex flex-col items-center text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-surface text-[28px]">
          🗑️
        </div>
        <p className="mt-4 text-[16px] font-semibold text-foreground">휴지통이 비어 있어요</p>
        <Link href="/" className="mt-5">
          <Button variant="ghost" size="md" className="border border-border">
            보관함으로
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex gap-2">
        <Button
          variant="ghost"
          size="md"
          className="border border-border"
          onClick={() => bulk("restore", rows.map((r) => r.id))}
        >
          전체 되살리기
        </Button>
        <Button variant="danger" size="md" onClick={emptyTrash}>
          휴지통 비우기
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-foreground">{r.title}</p>
              <p className="text-[12px] text-muted">
                {humanSize(r.sizeBytes)} · {new Date(r.createdAt).toLocaleDateString("ko-KR")}
              </p>
            </div>
            <button
              onClick={() => bulk("restore", [r.id])}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-weak-fg hover:bg-weak-bg"
            >
              되살리기
            </button>
            <button
              onClick={() => purgeOne(r)}
              className="rounded-lg px-2.5 py-1.5 text-[13px] text-danger hover:bg-[#fdecee]"
            >
              영구 삭제
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
