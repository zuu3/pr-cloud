// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { makeAdapter } from "@/components/upload-adapter";

afterEach(() => vi.restoreAllMocks());

describe("upload adapter", () => {
  it("shouldUseMultipart uses the client threshold", () => {
    const a = makeAdapter(() => undefined);
    expect(a.shouldUseMultipart({ size: 94_371_840 })).toBe(false);
    expect(a.shouldUseMultipart({ size: 94_371_841 })).toBe(true);
  });

  it("createMultipartUpload posts folderId and returns uploadId+key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ videoId: "v1", key: "k1", uploadId: "u1", partSize: 1 }),
        { status: 201 },
      ),
    );
    const a = makeAdapter(() => "folder-9");
    const file = { name: "x.mp4", type: "video/mp4", size: 10, meta: {} as Record<string, unknown> };
    const out = await a.createMultipartUpload(file);
    expect(out).toEqual({ uploadId: "u1", key: "k1" });
    expect(file.meta.videoId).toBe("v1");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.folderId).toBe("folder-9");
  });

  it("listParts maps server shape to S3 shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ parts: [{ partNumber: 1, etag: '"abc"', size: 5 }] }), {
        status: 200,
      }),
    );
    const a = makeAdapter(() => undefined);
    const parts = await a.listParts(null, { uploadId: "u1", key: "k1" });
    expect(parts).toEqual([{ PartNumber: 1, ETag: '"abc"', Size: 5 }]);
  });

  it("completeMultipartUpload maps S3 parts back to server shape", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ video: {} }), { status: 200 }));
    const a = makeAdapter(() => undefined);
    await a.completeMultipartUpload(null, {
      uploadId: "u1",
      key: "k1",
      parts: [{ PartNumber: 2, ETag: '"b"' }, { PartNumber: 1, ETag: '"a"' }],
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parts).toEqual([
      { partNumber: 2, etag: '"b"' },
      { partNumber: 1, etag: '"a"' },
    ]);
  });
});
