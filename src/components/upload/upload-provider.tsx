"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type UppyType from "@uppy/core";
import { useToast } from "@/components/ui/toast";
import { UploadCtx, type UploadItem } from "./upload-context";

// Uppy + its plugins are ~50KB+ and only matter once someone actually uploads,
// so the instance is built lazily on the first addFiles() call (or on mount if
// there's a resumable upload saved in localStorage).
export function UploadProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const rate = useRef<Map<string, { bytes: number; ts: number; ema: number }>>(new Map());
  const lastEmit = useRef<Map<string, number>>(new Map()); // throttle setItems per file

  const uppyRef = useRef<UppyType | null>(null);
  const initRef = useRef<Promise<UppyType> | null>(null);

  const buildUppy = useCallback(async (): Promise<UppyType> => {
    if (uppyRef.current) return uppyRef.current;
    if (initRef.current) return initRef.current;

    initRef.current = (async () => {
      const [{ default: Uppy }, { default: AwsS3 }, { default: GoldenRetriever }, { makeAdapter }] =
        await Promise.all([
          import("@uppy/core"),
          import("@uppy/aws-s3"),
          import("@uppy/golden-retriever"),
          import("@/components/upload-adapter"),
        ]);

      const a = makeAdapter();
      const u = new Uppy({ autoProceed: true, restrictions: { allowedFileTypes: ["video/*"] } });
      u.use(AwsS3, {
        shouldUseMultipart: (file) => a.shouldUseMultipart(file),
        // up to 10 parts in parallel (default 6) — fills a fast LAN link
        limit: 10,
        retryDelays: [0, 1000, 3000, 5000, 10_000, 20_000, 30_000],
        getUploadParameters: a.getUploadParameters as never,
        createMultipartUpload: a.createMultipartUpload as never,
        signPart: a.signPart as never,
        listParts: a.listParts as never,
        completeMultipartUpload: a.completeMultipartUpload as never,
        abortMultipartUpload: a.abortMultipartUpload as never,
      });
      u.use(GoldenRetriever, { serviceWorker: false });

      const upsert = (id: string, patch: Partial<UploadItem>) =>
        setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

      u.on("file-added", (file) => {
        rate.current.delete(file.id);
        lastEmit.current.delete(file.id);
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
        // rate math ran every event above; throttle the React update to ~4/s
        const nowMs = Date.now();
        const done = prog.bytesUploaded >= prog.bytesTotal;
        if (!done && nowMs - (lastEmit.current.get(file.id) ?? 0) < 250) return;
        lastEmit.current.set(file.id, nowMs);

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
        lastEmit.current.delete(file.id);
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
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("upload:done"));
      });

      u.on("upload-error", (file, error) => {
        console.error("[upload] upload-error", file?.name, error);
        if (file) upsert(file.id, { status: "error", speed: null, etaSec: null });
        toastRef.current.show('업로드가 멈췄어요. "다시 시도"를 누르면 이어서 올라가요.', "err");
      });
      u.on("error", (error) => console.error("[upload] uppy error", error));
      u.on("restriction-failed", (file, error) => {
        toastRef.current.show(`${file?.name ?? "파일"}: ${(error as Error).message}`, "err");
      });
      u.on("file-removed", (file) => {
        if (file) {
          rate.current.delete(file.id);
          lastEmit.current.delete(file.id);
          setItems((list) => list.filter((x) => x.id !== file.id));
        }
      });

      uppyRef.current = u;
      return u;
    })();
    return initRef.current;
  }, []);

  const addOne = (u: UppyType, f: File, folderId: string, name?: string) => {
    try {
      u.addFile({ name: name ?? f.name, type: f.type, data: f, meta: { folderId } });
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
    async (files: File[] | FileList, folderId?: string) => {
      const u = await buildUppy();
      for (const f of Array.from(files)) addOne(u, f, folderId ?? "");
      void u.upload().catch((e) => console.error("[upload] upload() rejected", e));
    },
    [buildUppy],
  );

  const addFilesWithFolders = useCallback(
    async (list: { file: File; folderId: string; name?: string }[]) => {
      const u = await buildUppy();
      for (const it of list) addOne(u, it.file, it.folderId, it.name);
      void u.upload().catch((e) => console.error("[upload] upload() rejected", e));
    },
    [buildUppy],
  );

  const removeItem = useCallback((id: string) => {
    try {
      uppyRef.current?.removeFile(id);
    } catch {
      /* ignore */
    }
    setItems((list) => list.filter((x) => x.id !== id));
  }, []);

  const retryItem = useCallback((id: string) => {
    setItems((list) =>
      list.map((x) => (x.id === id ? { ...x, status: "uploading", speed: null, etaSec: null } : x)),
    );
    void uppyRef.current?.retryUpload(id).catch((e) => console.error("[upload] retry rejected", e));
  }, []);

  const clearFinished = useCallback(
    () => setItems((list) => list.filter((x) => x.status === "uploading" || x.status === "queued")),
    [],
  );

  const activeCount = items.filter(
    (i) => i.status === "uploading" || i.status === "queued",
  ).length;

  // if a resumable upload is saved from a previous session, spin Uppy up now so
  // its "restored" prompt fires
  useEffect(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i)?.startsWith("uppyState:")) {
          void buildUppy();
          break;
        }
      }
    } catch {
      /* localStorage blocked — nothing to resume */
    }
  }, [buildUppy]);

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
