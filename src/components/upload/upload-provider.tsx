"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import { makeAdapter } from "@/components/upload-adapter";
import { useToast } from "@/components/ui/toast";

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
};

type Ctx = {
  items: UploadItem[];
  addFiles: (files: File[] | FileList, folderId?: string) => void;
  removeItem: (id: string) => void;
  clearFinished: () => void;
  activeCount: number;
};

const UploadCtx = createContext<Ctx | null>(null);

export function useUpload() {
  const c = useContext(UploadCtx);
  if (!c) throw new Error("useUpload must be used within <UploadProvider>");
  return c;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Create + wire Uppy exactly once. Not useMemo — React StrictMode (dev)
  // double-invokes effects, and destroying a memoized instance leaves a dead
  // Uppy that silently ignores addFile. This instance intentionally lives for
  // the app's lifetime (the provider sits in the root layout).
  const [uppy] = useState(() => {
    const a = makeAdapter();
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

    const upsert = (id: string, patch: Partial<UploadItem>) =>
      setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

    u.on("file-added", (file) =>
      setItems((list) => [
        ...list,
        {
          id: file.id,
          name: file.name ?? "video",
          size: file.size ?? 0,
          progress: 0,
          status: "queued",
        },
      ]),
    );
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
        try {
          await a.finalizeSingle(videoId);
        } catch {
          upsert(file.id, { status: "error" });
          toastRef.current.show(`${file.name} 마무리에 실패했어요. 다시 시도해 주세요.`, "err");
          return;
        }
      }
      upsert(file.id, { status: "done", progress: 100 });
      toastRef.current.show("업로드가 끝났어요");
    });
    u.on("upload-error", (file, error) => {
      console.error("[upload] upload-error", file?.name, error);
      if (file) upsert(file.id, { status: "error" });
      toastRef.current.show("업로드에 실패했어요", "err");
    });
    u.on("error", (error) => console.error("[upload] uppy error", error));
    u.on("restriction-failed", (file, error) => {
      console.warn("[upload] restriction-failed", file?.name, error);
      toastRef.current.show(`${file?.name ?? "파일"}: ${(error as Error).message}`, "err");
    });
    u.on("file-removed", (file) => {
      if (file) setItems((list) => list.filter((x) => x.id !== file.id));
    });
    return u;
  });

  const addFiles = useCallback(
    (files: File[] | FileList, folderId?: string) => {
      for (const f of Array.from(files)) {
        try {
          uppy.addFile({ name: f.name, type: f.type, data: f, meta: { folderId: folderId ?? "" } });
        } catch (e) {
          const msg = String((e as Error)?.message ?? "");
          if (/already added|noDuplicates/i.test(msg)) {
            toastRef.current.show(`${f.name}은(는) 이미 목록에 있어요`, "err");
          } else if (/allowedFileTypes|not an allowed/i.test(msg)) {
            toastRef.current.show(`${f.name}은(는) 영상 파일이 아니에요`, "err");
          } else {
            toastRef.current.show(`${f.name}을(를) 추가하지 못했어요`, "err");
          }
        }
      }
      // autoProceed can miss a synchronous batch add — kick it explicitly
      void uppy.upload().catch((e) => console.error("[upload] upload() rejected", e));
    },
    [uppy],
  );

  const removeItem = useCallback(
    (id: string) => {
      try {
        uppy.removeFile(id);
      } catch {
        setItems((list) => list.filter((x) => x.id !== id));
      }
    },
    [uppy],
  );

  const clearFinished = useCallback(
    () => setItems((list) => list.filter((x) => x.status === "uploading" || x.status === "queued")),
    [],
  );

  const activeCount = items.filter(
    (i) => i.status === "uploading" || i.status === "queued",
  ).length;

  return (
    <UploadCtx.Provider value={{ items, addFiles, removeItem, clearFinished, activeCount }}>
      {children}
    </UploadCtx.Provider>
  );
}
