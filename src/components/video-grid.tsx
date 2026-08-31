"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { humanSize } from "@/lib/format";

type Video = {
  id: string;
  title: string;
  sizeBytes: number | null;
  originalFilename: string;
  createdAt: string;
  folderId: string | null;
};
type Folder = { id: string; name: string; parentId: string | null };
type Page = { videos: Video[]; nextCursor: string | null };

export function VideoGrid({ initial, folders }: { initial: Page; folders: Folder[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const folderId = params.get("folderId") ?? undefined;

  const [videos, setVideos] = useState<Video[]>(initial.videos);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      const sp = new URLSearchParams();
      if (folderId) sp.set("folderId", folderId);
      if (q.trim()) sp.set("q", q.trim());
      router.replace(sp.toString() ? `/?${sp}` : "/");
      const res = await fetch(`/api/videos?${sp}`);
      if (res.ok) {
        const page: Page = await res.json();
        setVideos(page.videos);
        setCursor(page.nextCursor);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, folderId, router]);

  async function loadMore() {
    if (!cursor) return;
    const sp = new URLSearchParams();
    if (folderId) sp.set("folderId", folderId);
    if (q.trim()) sp.set("q", q.trim());
    sp.set("cursor", cursor);
    const res = await fetch(`/api/videos?${sp}`);
    if (res.ok) {
      const page: Page = await res.json();
      setVideos((v) => [...v, ...page.videos]);
      setCursor(page.nextCursor);
    }
  }

  const currentFolder = folders.find((f) => f.id === folderId);
  const childFolders = folders.filter((f) => (f.parentId ?? undefined) === folderId);

  async function newFolder() {
    const name = prompt("새 폴더 이름")?.trim();
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, parentId: folderId }),
    });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error ?? "폴더를 만들지 못했어요");
  }

  async function renameFolder() {
    if (!currentFolder) return;
    const name = prompt("폴더 이름 변경", currentFolder.name)?.trim();
    if (!name || name === currentFolder.name) return;
    const res = await fetch(`/api/folders/${currentFolder.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) router.refresh();
    else alert("이름을 바꾸지 못했어요");
  }

  async function deleteFolder() {
    if (!currentFolder) return;
    if (!confirm(`'${currentFolder.name}' 폴더를 삭제할까요?`)) return;
    const res = await fetch(`/api/folders/${currentFolder.id}`, { method: "DELETE" });
    if (res.status === 204) {
      router.push(currentFolder.parentId ? `/?folderId=${currentFolder.parentId}` : "/");
      router.refresh();
    } else {
      alert((await res.json().catch(() => ({}))).error ?? "삭제하지 못했어요");
    }
  }

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[24px] font-semibold">
          {currentFolder ? currentFolder.name : "전체 영상"}
        </h2>
        {folderId && (
          <Link href="/" className="text-[14px] text-weak-fg hover:underline">
            루트로
          </Link>
        )}
        {currentFolder && (
          <>
            <button onClick={renameFolder} className="text-[13px] text-muted hover:text-body">
              이름변경
            </button>
            <button onClick={deleteFolder} className="text-[13px] text-danger hover:underline">
              폴더삭제
            </button>
          </>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목 검색"
          aria-label="제목 검색"
          className="ml-auto h-10 w-64 rounded-lg border border-border bg-canvas px-3 text-[15px] outline-none focus:border-primary"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {childFolders.map((f) => (
          <Link
            key={f.id}
            href={`/?folderId=${f.id}`}
            className="rounded-lg bg-weak-bg px-3 py-1.5 text-[14px] text-weak-fg"
          >
            {f.name}
          </Link>
        ))}
        <button
          onClick={newFolder}
          className="rounded-lg border border-dashed border-border px-3 py-1.5 text-[14px] text-muted hover:border-primary hover:text-primary"
        >
          + 새 폴더
        </button>
      </div>

      {videos.length === 0 ? (
        <p className="mt-16 text-center text-[15px] text-muted">
          아직 올린 영상이 없어요. 첫 영상을 올려보세요.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <Link
              key={v.id}
              href={`/v/${v.id}`}
              className="rounded-xl border border-border bg-canvas p-4 shadow-sm hover:border-primary"
            >
              <p className="truncate text-[16px] font-medium text-foreground">{v.title}</p>
              <p className="mt-1 text-[13px] text-muted">
                {humanSize(v.sizeBytes)} · {new Date(v.createdAt).toLocaleDateString("ko-KR")}
              </p>
            </Link>
          ))}
        </div>
      )}

      {cursor && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            className="h-10 rounded-lg border border-border bg-canvas px-4 text-[14px] text-body hover:border-primary"
          >
            더 보기
          </button>
        </div>
      )}
    </main>
  );
}
