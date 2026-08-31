"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderPicker } from "@/components/folder-picker";
import { IconUpload } from "@/components/ui/icons";
import { useUpload } from "@/components/upload/upload-provider";
import { useToast } from "@/components/ui/toast";
import type { FolderNode } from "@/lib/folders";

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv|mts|m2ts|wmv|flv|mpg|mpeg|3gp|ogv)$/i;

export function Uploader({ folders }: { folders: FolderNode[] }) {
  const { addFiles, addFilesWithFolders } = useUpload();
  const toast = useToast();
  const params = useSearchParams();
  const initial = params.get("folderId") ?? "";
  const [folderId, setFolderId] = useState(
    folders.some((f) => f.id === initial) ? initial : "",
  );
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  function take(files: FileList | File[]) {
    addFiles(files, folderId || undefined);
  }

  async function takeTree(fileList: FileList) {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith("video/") || VIDEO_EXT.test(f.name),
    );
    if (files.length === 0) {
      toast.show("폴더 안에 영상 파일이 없어요", "err");
      return;
    }
    setPreparing(true);
    try {
      const base = folderId || null;
      const cache = new Map<string, string>(); // dir path -> folderId ("" = root/base)
      const items: { file: File; folderId: string }[] = [];
      let clamped = false;

      for (const f of files) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        const parts = rel.split("/");
        parts.pop(); // drop filename
        const key = parts.join("/");

        let fid = cache.get(key);
        if (fid === undefined) {
          if (parts.length === 0) {
            fid = base ?? "";
          } else {
            const res = await fetch("/api/folders/ensure", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ segments: parts, parentId: base }),
            });
            const data: { folderId?: string | null } = await res.json().catch(() => ({}));
            fid = (res.ok ? data.folderId : base) ?? "";
            if (parts.length > 3) clamped = true;
          }
          cache.set(key, fid);
        }
        items.push({ file: f, folderId: fid ?? "" });
      }

      addFilesWithFolders(items);
      if (clamped) {
        toast.show("폴더는 3단계까지만 만들어져요. 더 깊은 영상은 상위 폴더에 담겼어요.");
      }
    } finally {
      setPreparing(false);
    }
  }

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 sm:py-12">
      <h1 className="text-[28px] font-bold tracking-[-0.01em] text-foreground">영상 업로드</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-body">
        큰 파일도 자동으로 나눠서 올라가고, 중간에 끊겨도 이어서 올라가요.
      </p>
      <div className="mt-4 rounded-xl bg-weak-bg px-4 py-3 text-[13px] leading-[1.6] text-weak-fg">
        H.264 MP4를 권장해요. 교내 유선 연결에서 올리면 가장 빨라요.
      </div>

      <div className="mt-6 flex items-center gap-2">
        <span className="shrink-0 text-[14px] font-medium text-body">폴더</span>
        <FolderPicker
          folders={folders}
          value={folderId}
          onChange={setFolderId}
          className="w-[260px] max-w-full"
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragging ? "border-primary bg-weak-bg" : "border-border bg-surface hover:border-primary"
        }`}
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-canvas text-[22px] text-primary">
          <IconUpload />
        </div>
        <p className="mt-3 text-[15px] font-semibold text-foreground">
          영상을 여기로 끌어다 놓으세요
        </p>
        <p className="mt-1 text-[13px] text-muted">또는 클릭해서 파일 선택 · 여러 개 가능</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => e.target.files && take(e.target.files)}
        />
      </div>

      <div className="mt-3 flex items-center gap-2 text-[13px]">
        <button
          type="button"
          onClick={() => dirInputRef.current?.click()}
          disabled={preparing}
          className="font-medium text-primary hover:underline disabled:opacity-50"
        >
          {preparing ? "폴더 준비 중…" : "폴더 통째로 올리기"}
        </button>
        <span className="text-muted">— SD카드 폴더 구조 그대로 올라가요</span>
        <input
          ref={dirInputRef}
          type="file"
          hidden
          multiple
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ webkitdirectory: "", directory: "" } as any)}
          onChange={(e) => e.target.files && takeTree(e.target.files)}
        />
      </div>

      <p className="mt-3 text-[13px] text-muted">
        업로드 진행 상황은 오른쪽 아래에서 확인할 수 있어요. 다른 페이지로 넘어가도 계속
        올라가요.
      </p>
    </main>
  );
}
