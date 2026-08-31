"use client";

import { useMemo, useRef, useState } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/lib/Dashboard.js";
import AwsS3 from "@uppy/aws-s3";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import { makeAdapter } from "./upload-adapter";

type Folder = { id: string; name: string; parentId: string | null };

export function Uploader({ folders }: { folders: Folder[] }) {
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
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
    });
    return u;
  }, []);

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-8">
      <h2 className="text-[24px] font-semibold">영상 업로드</h2>
      <p className="mb-6 mt-1 text-[14px] text-muted">
        큰 파일은 자동으로 나눠서 올라가고, 중간에 끊겨도 이어서 올라가요. H.264 MP4를
        권장하고, 교내 유선 연결에서 올리는 게 가장 빨라요.
      </p>

      <label className="text-[14px] text-body">
        폴더&nbsp;
        <select
          value={folderId ?? ""}
          onChange={(e) => setFolderId(e.target.value || undefined)}
          className="rounded-md border border-border bg-canvas px-2 py-1"
        >
          <option value="">(루트)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4">
        <Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} height={420} />
      </div>
    </main>
  );
}
