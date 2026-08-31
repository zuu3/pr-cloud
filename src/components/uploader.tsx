"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import { makeAdapter } from "./upload-adapter";
import { Select } from "@/components/ui/select";
import { IconUpload } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { humanSize } from "@/lib/format";
import { folderOptions, type FolderNode } from "@/lib/folders";

type Item = {
  id: string;
  name: string;
  size: number;
  progress: number; // 0..100
  status: "queued" | "uploading" | "done" | "error";
};

export function Uploader({ folders }: { folders: FolderNode[] }) {
  const toast = useToast();
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef(folderId);
  folderRef.current = folderId;
  const opts = folderOptions(folders);

  const uppy = useMemo(() => {
    const a = makeAdapter(() => folderRef.current);
    const u = new Uppy({ autoProceed: true, restrictions: { allowedFileTypes: ["video/*"] } });
    u.use(AwsS3, {
      shouldUseMultipart: (file) => a.shouldUseMultipart(file),
      getUploadParameters: a.getUploadParameters as never,
      createMultipartUpload: a.createMultipartUpload as never,
      signPart: a.signPart as never,
      listParts: a.listParts as never,
      completeMultipartUpload: a.completeMultipartUpload as never,
      abortMultipartUpload: a.abortMultipartUpload as never,
    });

    const upsert = (id: string, patch: Partial<Item>) =>
      setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

    u.on("file-added", (file) => {
      setItems((list) => [
        ...list,
        {
          id: file.id,
          name: file.name ?? "video",
          size: file.size ?? 0,
          progress: 0,
          status: "queued",
        },
      ]);
    });
    u.on("upload-progress", (file, prog) => {
      if (!file || !prog.bytesTotal) return;
      upsert(file.id, {
        status: "uploading",
        progress: Math.round((prog.bytesUploaded / prog.bytesTotal) * 100),
      });
    });
    u.on("upload-success", async (file) => {
      if (!file) return;
      const videoId = file.meta?.videoId as string | undefined;
      if (videoId && !a.shouldUseMultipart({ size: file.size ?? 0 })) {
        await a.finalizeSingle(videoId).catch(() => {});
      }
      upsert(file.id, { status: "done", progress: 100 });
      toast.show("업로드가 끝났어요");
    });
    u.on("upload-error", (file) => {
      if (file) upsert(file.id, { status: "error" });
      toast.show("업로드에 실패했어요", "err");
    });
    return u;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => uppy.destroy(), [uppy]);

  function addFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      try {
        uppy.addFile({ name: f.name, type: f.type, data: f });
      } catch {
        toast.show(`${f.name}은(는) 영상 파일이 아니에요`, "err");
      }
    }
  }

  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 sm:py-12">
      <h1 className="text-[28px] font-bold tracking-[-0.01em] text-foreground">영상 업로드</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-body">
        큰 파일도 자동으로 나눠서 올라가고, 중간에 끊겨도 이어서 올라가요.
      </p>
      <div className="mt-4 rounded-xl bg-weak-bg px-4 py-3 text-[13px] leading-[1.6] text-weak-fg">
        H.264 MP4를 권장해요. 교내 유선 연결에서 올리면 가장 빨라요.
      </div>

      <label className="mt-6 flex items-center gap-2 text-[14px] font-medium text-body">
        폴더
        <Select
          value={folderId ?? ""}
          onChange={(e) => setFolderId(e.target.value || undefined)}
          className="h-10 text-[14px]"
        >
          <option value="">보관함 루트</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
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
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border border-border bg-canvas p-3">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {it.name}
                </span>
                <span className="shrink-0 text-muted">{humanSize(it.size)}</span>
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
                  {it.status === "error" && "실패"}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full transition-all ${
                    it.status === "error" ? "bg-danger" : "bg-primary"
                  }`}
                  style={{ width: `${it.status === "done" ? 100 : it.progress}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {doneCount > 0 && (
        <p className="mt-4 text-[14px] text-body">
          {doneCount}개 업로드 완료.{" "}
          <Link href="/" className="font-semibold text-primary hover:underline">
            보관함에서 보기 →
          </Link>
        </p>
      )}
    </main>
  );
}
