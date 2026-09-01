"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export function FolderMenu({
  onRename,
  onCover,
  onShare,
  onDownload,
  onDelete,
  deleting,
}: {
  onRename: () => void;
  onCover: () => void;
  onShare: () => void;
  onDownload: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        aria-label="폴더 메뉴"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-body"
      >
        ⋯
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            style={{ transformOrigin: "top left" }}
            className="absolute left-0 top-9 z-20 w-36 overflow-hidden rounded-xl border border-border bg-canvas py-1 shadow-[0_8px_24px_-8px_rgba(25,31,40,0.2)]"
          >
            <button
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              className="block w-full px-3.5 py-2 text-left text-[13px] text-body hover:bg-surface"
            >
              이름 변경
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onCover();
              }}
              className="block w-full px-3.5 py-2 text-left text-[13px] text-body hover:bg-surface"
            >
              커버 이미지
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onShare();
              }}
              className="block w-full px-3.5 py-2 text-left text-[13px] text-body hover:bg-surface"
            >
              공유 링크
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDownload();
              }}
              className="block w-full px-3.5 py-2 text-left text-[13px] text-body hover:bg-surface"
            >
              ZIP 다운로드
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              disabled={deleting}
              className="block w-full px-3.5 py-2 text-left text-[13px] text-danger hover:bg-[#fdecee] disabled:opacity-50"
            >
              {deleting ? "삭제 중…" : "폴더 삭제"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
