"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useUpload } from "./upload-provider";
import { humanSize, humanEta, humanSpeed } from "@/lib/format";
import { IconChevronDown } from "@/components/ui/icons";

export function UploadTray() {
  const { items, removeItem, retryItem, clearFinished, activeCount } = useUpload();
  const [open, setOpen] = useState(true);

  const done = items.filter((i) => i.status === "done").length;
  const err = items.filter((i) => i.status === "error").length;
  const title =
    activeCount > 0
      ? `${activeCount}개 업로드 중`
      : err > 0
        ? `${done}개 완료 · ${err}개 실패`
        : `${done}개 업로드 완료`;

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 32, y: 8 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 32 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_16px_48px_-12px_rgba(25,31,40,0.3)]"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="text-[13px] font-semibold text-foreground">{title}</span>
            <div className="ml-auto flex items-center gap-1">
              {activeCount === 0 && (
                <button
                  onClick={clearFinished}
                  className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface hover:text-body"
                >
                  지우기
                </button>
              )}
              <button
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "접기" : "펼치기"}
                className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-body"
              >
                <IconChevronDown className={`size-4 transition-transform ${open ? "" : "rotate-180"}`} />
              </button>
            </div>
          </div>

          {open && (
            <ul className="max-h-72 overflow-auto p-2">
              {items.map((it) => (
                <li key={it.id} className="rounded-lg px-2 py-2">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {it.name}
                    </span>
                    <span
                      className={`shrink-0 font-medium ${
                        it.status === "error"
                          ? "text-danger"
                          : it.status === "done"
                            ? "text-weak-fg"
                            : "text-muted"
                      }`}
                    >
                      {it.status === "queued" && "대기 중"}
                      {it.status === "uploading" && `${it.progress}%`}
                      {it.status === "done" && "완료"}
                      {it.status === "error" && "멈춤"}
                    </span>
                    {(it.status === "queued" || it.status === "uploading") && (
                      <button
                        onClick={() => removeItem(it.id)}
                        aria-label="업로드 취소"
                        className="grid size-5 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-danger"
                      >
                        ×
                      </button>
                    )}
                    {it.status === "error" && (
                      <button
                        onClick={() => retryItem(it.id)}
                        className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-body hover:border-primary hover:text-primary"
                      >
                        다시 시도
                      </button>
                    )}
                  </div>

                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full transition-all ${
                        it.status === "error" ? "bg-danger" : "bg-primary"
                      }`}
                      style={{ width: `${it.status === "done" ? 100 : it.progress}%` }}
                    />
                  </div>

                  <p className="mt-1 text-[11px] text-muted">
                    {it.status === "uploading" && it.speed
                      ? `${humanSpeed(it.speed)}${it.etaSec ? ` · 남은 시간 약 ${humanEta(it.etaSec)}` : ""}`
                      : it.status === "error"
                        ? "네트워크가 끊겼어요. 다시 시도하면 이어서 올라가요."
                        : humanSize(it.size)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {open && done > 0 && activeCount === 0 && (
            <div className="border-t border-border px-4 py-2 text-[12px]">
              <Link href="/" className="font-semibold text-primary hover:underline">
                보관함에서 보기 →
              </Link>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
