"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { IconChevronDown, IconCheck } from "@/components/ui/icons";

type Opt = { value: string; label: string };

export function Dropdown({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
  className = "",
  align = "left",
}: {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => setMounted(true), []);

  // position the portal-rendered popover against the trigger
  useLayoutEffect(() => {
    if (open) setRect(btnRef.current?.getBoundingClientRect() ?? null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // any scroll (page or an overflow container) drops the popover rather than drift
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-1.5 rounded-xl border border-border bg-surface pl-3 pr-2 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-primary focus-visible:border-primary disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? ""}</span>
        <IconChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={popRef}
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -6 }}
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
                style={{
                  position: "fixed",
                  top: rect.bottom + 4,
                  left: align === "right" ? undefined : rect.left,
                  right: align === "right" ? window.innerWidth - rect.right : undefined,
                  minWidth: rect.width,
                  transformOrigin: align === "right" ? "top right" : "top left",
                }}
                className="z-[60] max-h-64 w-max overflow-auto rounded-xl border border-border bg-canvas p-1 shadow-[0_12px_32px_-8px_rgba(25,31,40,0.25)]"
              >
                {options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] ${
                      o.value === value
                        ? "bg-weak-bg font-medium text-weak-fg"
                        : "text-body hover:bg-surface"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.value === value && <IconCheck className="size-4 shrink-0" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
