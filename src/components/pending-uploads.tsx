"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "@/components/providers";
import { useDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Row = {
  id: string;
  title: string;
  status: "pending" | "uploading" | "failed";
  createdAt: string;
};

export function PendingUploads() {
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<{ uploads: Row[] }>({
    queryKey: ["uploads-pending"],
    queryFn: () => apiFetch("/api/uploads/pending"),
    refetchInterval: 30_000,
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/uploads/pending?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uploads-pending"] });
      toast.show("지웠어요");
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const rows = data?.uploads ?? [];
  if (rows.length === 0) return null;

  async function discard(r: Row) {
    const ok = await dialog.confirm({
      title: "이 업로드를 지울까요?",
      body: `'${r.title}'은(는) 끝까지 올라오지 못했어요. 목록에서만 지우고, 저장된 영상은 없어요.`,
      danger: true,
      confirmText: "지우기",
    });
    if (ok) del.mutate(r.id);
  }

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-[#e8b800]/40 bg-[#fff9e6]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="size-1.5 rounded-full bg-[#e8b800]" />
        <span className="text-[14px] font-semibold text-foreground">
          완료되지 않은 업로드 {rows.length}개
        </span>
        <span className="ml-auto text-[12px] text-muted">{open ? "접기" : "보기"}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="overflow-hidden border-t border-[#e8b800]/30"
          >
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[#e8b800]/20"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{r.title}</span>
                <span className="shrink-0 text-[12px] text-muted">
                  {r.status === "failed" ? "실패" : "멈춤"}
                </span>
                <button
                  onClick={() => discard(r)}
                  disabled={del.isPending}
                  className="shrink-0 rounded-md px-2 py-1 text-[12px] text-danger hover:bg-[#fdecee] disabled:opacity-40"
                >
                  지우기
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
