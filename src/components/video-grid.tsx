"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { humanSize } from "@/lib/format";
import { Button } from "@/components/ui/button";

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
    <main className="mx-auto max-w-[1120px] px-6 py-10 sm:py-12">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <h1 className="text-[28px] font-bold tracking-[-0.01em] text-foreground">
          {currentFolder ? currentFolder.name : "보관함"}
        </h1>
        {folderId && (
          <Link
            href={currentFolder?.parentId ? `/?folderId=${currentFolder.parentId}` : "/"}
            className="pb-1 text-[13px] text-muted hover:text-body"
          >
            ← 상위 폴더
          </Link>
        )}
        {currentFolder && (
          <div className="flex gap-1 pb-0.5">
            <button
              onClick={renameFolder}
              className="rounded-md px-2 py-1 text-[13px] text-muted hover:bg-surface hover:text-body"
            >
              이름 변경
            </button>
            <button
              onClick={deleteFolder}
              className="rounded-md px-2 py-1 text-[13px] text-danger hover:bg-[#fdecee]"
            >
              폴더 삭제
            </button>
          </div>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목으로 검색"
          aria-label="제목으로 검색"
          className="ml-auto h-10 w-full max-w-[260px] rounded-xl border border-border bg-surface px-3.5 text-[14px] outline-none transition-colors focus:border-primary focus:bg-canvas"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {childFolders.map((f) => (
          <Link
            key={f.id}
            href={`/?folderId=${f.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-weak-bg px-3.5 py-2 text-[13px] font-medium text-weak-fg transition-transform hover:-translate-y-0.5"
          >
            <span aria-hidden>📁</span>
            {f.name}
          </Link>
        ))}
        <button
          onClick={newFolder}
          className="rounded-xl border border-dashed border-border px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
        >
          + 새 폴더
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="mt-20 flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-surface text-[28px]">
            🎞️
          </div>
          <p className="mt-4 text-[16px] font-semibold text-foreground">
            {q ? "검색 결과가 없어요" : "아직 올린 영상이 없어요"}
          </p>
          <p className="mt-1 text-[14px] text-muted">
            {q ? "다른 제목으로 찾아보세요." : "첫 영상을 올려보세요."}
          </p>
          {!q && (
            <Link href="/upload" className="mt-5">
              <Button size="md">영상 업로드</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <Link
              key={v.id}
              href={`/v/${v.id}`}
              className="group overflow-hidden rounded-2xl border border-border bg-canvas transition-all hover:-translate-y-1 hover:border-primary hover:shadow-[0_8px_24px_-12px_rgba(25,31,40,0.15)]"
            >
              <div className="flex aspect-video items-center justify-center bg-surface text-[32px] text-muted/60">
                ▶
              </div>
              <div className="p-4">
                <p className="truncate text-[15px] font-semibold text-foreground">{v.title}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {humanSize(v.sizeBytes)} · {new Date(v.createdAt).toLocaleDateString("ko-KR")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {cursor && (
        <div className="mt-8 text-center">
          <Button variant="ghost" size="md" onClick={loadMore} className="border border-border">
            더 보기
          </Button>
        </div>
      )}
    </main>
  );
}
