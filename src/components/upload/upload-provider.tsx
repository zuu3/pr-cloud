"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import GoldenRetriever from "@uppy/golden-retriever";
import { makeAdapter } from "@/components/upload-adapter";
import { useToast } from "@/components/ui/toast";

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  speed: number | null; // bytes/sec
  etaSec: number | null;
};

type Ctx = {
  items: UploadItem[];
  addFiles: (files: File[] | FileList, folderId?: string) => void;
  addFilesWithFolders: (items: { file: File; folderId: string }[]) => void;
  removeItem: (id: string) => void;
  retryItem: (id: string) => void;
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
  // smoothed speed tracking per file
  const rate = useRef<Map<string, { bytes: number; ts: number; ema: number }>>(new Map());

  const [uppy] = useState(() => {
    const a = makeAdapter();
    const u = new Uppy({ autoProceed: true, restrictions: { allowedFileTypes: ["video/*"] } });
    u.use(AwsS3, {
      shouldUseMultipart: (file) => a.shouldUseMultipart(file),
      // more attempts, longer backoff — a flaky network shouldn't lose the upload
      retryDelays: [0, 1000, 3000, 5000, 10_000, 20_000, 30_000],
      getUploadParameters: a.getUploadParameters as never,
      createMultipartUpload: a.createMultipartUpload as never,
      signPart: a.signPart as never,
      listParts: a.listParts as never,
      completeMultipartUpload: a.completeMultipartUpload as never,
      abortMultipartUpload: a.abortMultipartUpload as never,
    });
    // resume in-progress multipart uploads after a reload / crash. Small files
    // are cached in IndexedDB; large ones need the same file re-picked, then
    // resume from listParts.
    if (typeof window !== "undefined") {
      u.use(GoldenRetriever, { serviceWorker: false });
    }

    const upsert = (id: string, patch: Partial<UploadItem>) =>
      setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

    u.on("file-added", (file) => {
      rate.current.delete(file.id);
      setItems((list) => [
        ...list,
        {
          id: file.id,
          name: file.name ?? "video",
          size: file.size ?? 0,
          progress: 0,
          status: "queued",
          speed: null,
          etaSec: null,
        },
      ]);
    });

    u.on("restored", () => {
      toastRef.current.show(
        "이어올릴 업로드가 있어요. 같은 파일을 다시 선택하면 멈춘 지점부터 올라가요.",
      );
    });

    u.on("upload-progress", (file, prog) => {
      if (!file || !prog.bytesTotal) return;
      const now = performance.now();
      const prev = rate.current.get(file.id);
      let speed: number | null = null;
      if (prev) {
        const dt = (now - prev.ts) / 1000;
        const db = prog.bytesUploaded - prev.bytes;
        if (dt > 0.15 && db >= 0) {
          const inst = db / dt;
          const ema = prev.ema ? prev.ema * 0.7 + inst * 0.3 : inst;
          rate.current.set(file.id, { bytes: prog.bytesUploaded, ts: now, ema });
          speed = ema;
        } else {
          speed = prev.ema || null;
        }
      } else {
        rate.current.set(file.id, { bytes: prog.bytesUploaded, ts: now, ema: 0 });
      }
      const remaining = prog.bytesTotal - prog.bytesUploaded;
      upsert(file.id, {
        status: "uploading",
        progress: Math.round((prog.bytesUploaded / prog.bytesTotal) * 100),
        speed,
        etaSec: speed && speed > 0 ? remaining / speed : null,
      });
    });

    u.on("upload-success", async (file) => {
      if (!file) return;
      rate.current.delete(file.id);
      const videoId = file.meta?.videoId as string | undefined;
      if (videoId && !a.shouldUseMultipart({ size: file.size ?? 0 })) {
        try {
          await a.finalizeSingle(videoId);
        } catch {
          upsert(file.id, { status: "error", speed: null, etaSec: null });
          toastRef.current.show(`${file.name} 마무리에 실패했어요. "다시 시도"를 눌러 주세요.`, "err");
          return;
        }
      }
      upsert(file.id, { status: "done", progress: 100, speed: null, etaSec: null });
      toastRef.current.show("업로드가 끝났어요");
    });

    u.on("upload-error", (file, error) => {
      console.error("[upload] upload-error", file?.name, error);
      if (file) upsert(file.id, { status: "error", speed: null, etaSec: null });
      toastRef.current.show("업로드가 멈췄어요. \"다시 시도\"를 누르면 이어서 올라가요.", "err");
    });
    u.on("error", (error) => console.error("[upload] uppy error", error));
    u.on("restriction-failed", (file, error) => {
      toastRef.current.show(`${file?.name ?? "파일"}: ${(error as Error).message}`, "err");
    });
    u.on("file-removed", (file) => {
      if (file) {
        rate.current.delete(file.id);
        setItems((list) => list.filter((x) => x.id !== file.id));
      }
    });
    return u;
  });

  const addOne = (f: File, folderId: string) => {
    try {
      uppy.addFile({ name: f.name, type: f.type, data: f, meta: { folderId } });
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
  };

  const addFiles = useCallback(
    (files: File[] | FileList, folderId?: string) => {
      for (const f of Array.from(files)) addOne(f, folderId ?? "");
      void uppy.upload().catch((e) => console.error("[upload] upload() rejected", e));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uppy],
  );

  const addFilesWithFolders = useCallback(
    (list: { file: File; folderId: string }[]) => {
      for (const it of list) addOne(it.file, it.folderId);
      void uppy.upload().catch((e) => console.error("[upload] upload() rejected", e));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const retryItem = useCallback(
    (id: string) => {
      setItems((list) =>
        list.map((x) => (x.id === id ? { ...x, status: "uploading", speed: null, etaSec: null } : x)),
      );
      void uppy.retryUpload(id).catch((e) => console.error("[upload] retry rejected", e));
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

  // warn before leaving while an upload is running
  useEffect(() => {
    if (activeCount === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [activeCount]);

  return (
    <UploadCtx.Provider
      value={{
        items,
        addFiles,
        addFilesWithFolders,
        removeItem,
        retryItem,
        clearFinished,
        activeCount,
      }}
    >
      {children}
    </UploadCtx.Provider>
  );
}
