// Pure functions wiring @uppy/aws-s3 (v4) callbacks to our presigned-per-op
// backend. Kept framework-free so it is unit-testable without an Uppy instance.

export const SINGLE_PUT_MAX = Number(
  process.env.NEXT_PUBLIC_SINGLE_PUT_MAX_BYTES ?? 94_371_840,
);

type FileMeta = { meta: Record<string, unknown>; name: string; type?: string; size?: number };

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `POST ${url} 실패`);
  return data;
}

export function makeAdapter(getFolderId: () => string | undefined) {
  return {
    shouldUseMultipart: (f: { size?: number | null }) => (f.size ?? 0) > SINGLE_PUT_MAX,

    // --- single PUT ---
    getUploadParameters: async (f: FileMeta) => {
      const d = await post("/api/uploads", {
        title: f.name,
        originalFilename: f.name,
        contentType: f.type || "application/octet-stream",
        size: f.size ?? 0,
        folderId: getFolderId(),
      });
      f.meta.videoId = d.videoId;
      return {
        method: "PUT" as const,
        url: d.url as string,
        headers: { "content-type": f.type || "application/octet-stream" },
      };
    },
    finalizeSingle: async (videoId: string) => {
      const res = await fetch(`/api/uploads/${videoId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error("업로드 마무리에 실패했어요");
    },

    // --- multipart ---
    createMultipartUpload: async (f: FileMeta) => {
      const d = await post("/api/uploads/create", {
        title: f.name,
        originalFilename: f.name,
        contentType: f.type || "application/octet-stream",
        size: f.size ?? 0,
        folderId: getFolderId(),
      });
      f.meta.videoId = d.videoId;
      return { uploadId: d.uploadId as string, key: d.key as string };
    },
    signPart: async (
      _f: unknown,
      o: { uploadId: string; key: string; partNumber: number },
    ) => {
      const d = await post("/api/uploads/sign-part", {
        key: o.key,
        uploadId: o.uploadId,
        partNumber: o.partNumber,
      });
      return { url: d.url as string };
    },
    listParts: async (_f: unknown, o: { uploadId: string; key: string }) => {
      const url = `/api/uploads/list-parts?key=${encodeURIComponent(o.key)}&uploadId=${encodeURIComponent(o.uploadId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("이어올리기 정보를 가져오지 못했어요");
      const { parts } = await res.json();
      return (parts as { partNumber: number; etag: string; size: number }[]).map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.etag,
        Size: p.size,
      }));
    },
    completeMultipartUpload: async (
      _f: unknown,
      o: { uploadId: string; key: string; parts: { PartNumber?: number; ETag?: string }[] },
    ) => {
      await post("/api/uploads/complete", {
        key: o.key,
        uploadId: o.uploadId,
        parts: o.parts.map((p) => ({ partNumber: p.PartNumber, etag: p.ETag })),
      });
      return {};
    },
    abortMultipartUpload: async (_f: unknown, o: { uploadId: string; key: string }) => {
      await post("/api/uploads/abort", { key: o.key, uploadId: o.uploadId }).catch(() => {});
    },
  };
}
