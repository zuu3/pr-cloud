"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/lib/Dashboard.js";
import AwsS3 from "@uppy/aws-s3";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import { makeAdapter } from "./upload-adapter";
import { useToast } from "@/components/ui/toast";

type Folder = { id: string; name: string; parentId: string | null };

export function Uploader({ folders }: { folders: Folder[] }) {
  const toast = useToast();
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(0);
  const folderRef = useRef(folderId);
  folderRef.current = folderId;

  const uppy = useMemo(() => {
    const a = makeAdapter(() => folderRef.current);
    const u = new Uppy({
      autoProceed: false,
      restrictions: { allowedFileTypes: ["video/*"] },
    });
    u.use(AwsS3, {
      shouldUseMultipart: (file) => a.shouldUseMultipart(file),
      getUploadParameters: a.getUploadParameters as never,
      createMultipartUpload: a.createMultipartUpload as never,
      signPart: a.signPart as never,
      listParts: a.listParts as never,
      completeMultipartUpload: a.completeMultipartUpload as never,
      abortMultipartUpload: a.abortMultipartUpload as never,
    });
    u.on("upload-success", async (file) => {
      const videoId = file?.meta?.videoId as string | undefined;
      if (videoId && !a.shouldUseMultipart({ size: file?.size ?? 0 })) {
        await a.finalizeSingle(videoId);
      }
      setDone((n) => n + 1);
      toast.show("업로드가 끝났어요");
    });
    return u;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        <select
          value={folderId ?? ""}
          onChange={(e) => setFolderId(e.target.value || undefined)}
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[14px] outline-none focus:border-primary focus:bg-canvas"
        >
          <option value="">보관함 루트</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 [&_.uppy-Dashboard-inner]:!rounded-2xl [&_.uppy-Dashboard-inner]:!border-border">
        <Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} height={440} width="100%" />
      </div>

      {done > 0 && (
        <p className="mt-3 text-[14px] text-body">
          {done}개 업로드 완료.{" "}
          <Link href="/" className="font-semibold text-primary hover:underline">
            보관함에서 보기 →
          </Link>
        </p>
      )}
    </main>
  );
}
