"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderPicker } from "@/components/folder-picker";
import { IconUpload } from "@/components/ui/icons";
import { useUpload } from "@/components/upload/upload-provider";
import type { FolderNode } from "@/lib/folders";

export function Uploader({ folders }: { folders: FolderNode[] }) {
  const { addFiles } = useUpload();
  const params = useSearchParams();
  const initial = params.get("folderId") ?? "";
  const [folderId, setFolderId] = useState(
    folders.some((f) => f.id === initial) ? initial : "",
  );
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function take(files: FileList | File[]) {
    addFiles(files, folderId || undefined);
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

      <p className="mt-3 text-[13px] text-muted">
        업로드 진행 상황은 오른쪽 아래에서 확인할 수 있어요. 다른 페이지로 넘어가도 계속
        올라가요.
      </p>
    </main>
  );
}
