"use client";

import { useEffect, useRef, useState } from "react";
import { folderPath, folderTree, type FolderNode } from "@/lib/folders";
import { IconChevronDown, IconFolder, IconCheck } from "@/components/ui/icons";

/** Custom folder dropdown — a small tree, no native <select>. value "" = 보관함 루트. */
export function FolderPicker({
  folders,
  value,
  onChange,
  disabled,
  className = "",
}: {
  folders: FolderNode[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tree = folderTree(folders);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = value ? folderPath(folders, value) : "보관함 루트";

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface pl-3 pr-2.5 text-[14px] text-foreground outline-none transition-colors hover:border-primary focus-visible:border-primary disabled:opacity-50"
      >
        <IconFolder className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <IconChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 max-h-72 w-[min(320px,80vw)] overflow-auto rounded-xl border border-border bg-canvas p-1 shadow-[0_12px_32px_-8px_rgba(25,31,40,0.25)]">
          <Row label="보관함 루트" depth={0} selected={value === ""} onClick={() => pick("")} />
          {tree.map((f) => (
            <Row
              key={f.id}
              label={f.name}
              depth={f.depth + 1}
              selected={value === f.id}
              onClick={() => pick(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  depth,
  selected,
  onClick,
}: {
  label: string;
  depth: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 16 }}
      className={`flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-[13px] ${
        selected ? "bg-weak-bg font-medium text-weak-fg" : "text-body hover:bg-surface"
      }`}
    >
      <IconFolder className="size-4 shrink-0 opacity-60" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <IconCheck className="size-4 shrink-0" />}
    </button>
  );
}
