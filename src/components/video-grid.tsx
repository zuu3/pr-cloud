"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { humanSize, humanDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/components/providers";
import { useDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Video = {
  id: string;
  title: string;
  sizeBytes: number | null;
  originalFilename: string;
  durationSec: number | null;
  thumbUrl: string | null;
  viewCount: number;
  createdAt: string;
  folderId: string | null;
};
type Folder = { id: string; name: string; parentId: string | null };
type Page = { videos: Video[]; nextCursor: string | null };

const SORTS = [
  ["new", "최신순"],
  ["old", "오래된순"],
  ["title", "제목순"],
  ["size", "용량순"],
] as const;

export function VideoGrid({ initial, folders }: { initial: Page; folders: Folder[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const dialog = useDialog();
  const toast = useToast();
  const folderId = params.get("folderId") ?? undefined;

  const [videos, setVideos] = useState<Video[]>(initial.videos);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState(params.get("sort") ?? "new");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const first = useRef(true);

  const selMode = sel.size > 0;
  const allFolders = useMemo(() => folders, [folders]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      const sp = new URLSearchParams();
      if (folderId) sp.set("folderId", folderId);
      if (q.trim()) sp.set("q", q.trim());
      if (sort !== "new") sp.set("sort", sort);
      router.replace(sp.toString() ? `/?${sp}` : "/");
      const res = await fetch(`/api/videos?${sp}`);
      if (res.ok) {
        const page: Page = await res.json();
        setVideos(page.videos);
        setCursor(page.nextCursor);
        setSel(new Set());
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q, folderId, sort, router]);

  async function loadMore() {
    if (!cursor) return;
    const sp = new URLSearchParams();
    if (folderId) sp.set("folderId", folderId);
    if (q.trim()) sp.set("q", q.trim());
    if (sort !== "new") sp.set("sort", sort);
    sp.set("cursor", cursor);
    const res = await fetch(`/api/videos?${sp}`);
    if (res.ok) {
      const page: Page = await res.json();
      setVideos((v) => [...v, ...page.videos]);
      setCursor(page.nextCursor);
    }
  }

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const currentFolder = folders.find((f) => f.id === folderId);
  const childFolders = folders.filter((f) => (f.parentId ?? undefined) === folderId);

  // full ancestor chain: 보관함 / … / current
  const trail: Folder[] = [];
  for (let f = currentFolder; f; f = folders.find((x) => x.id === f!.parentId)) {
    trail.unshift(f);
  }

  const bulkM = useMutation({
    mutationFn: (v: { action: "trash" | "move"; folderId?: string | null; ids: string[] }) =>
      apiFetch("/api/videos/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: v.ids, action: v.action, folderId: v.folderId }),
      }),
    onSuccess: (data, v) => {
      setVideos((list) => list.filter((x) => !v.ids.includes(x.id)));
      setSel(new Set());
      toast.show(v.action === "trash" ? `${data.count}개를 삭제했어요` : `${data.count}개를 옮겼어요`);
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const newFolderM = useMutation({
    mutationFn: (name: string) =>
      apiFetch("/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: folderId }),
      }),
    onSuccess: () => {
      router.refresh();
      toast.show("폴더를 만들었어요");
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const renameFolderM = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/api/folders/${currentFolder!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      router.refresh();
      toast.show("이름을 바꿨어요");
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const deleteFolderM = useMutation({
    mutationFn: () => apiFetch(`/api/folders/${currentFolder!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      router.push(currentFolder!.parentId ? `/?folderId=${currentFolder!.parentId}` : "/");
      router.refresh();
      toast.show("폴더를 삭제했어요");
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  async function bulkDelete() {
    const ok = await dialog.confirm({
      title: `${sel.size}개 영상을 삭제할까요?`,
      body: "휴지통으로 옮겨요. 나중에 되살릴 수 있어요.",
      danger: true,
      confirmText: "삭제",
    });
    if (ok) bulkM.mutate({ action: "trash", ids: [...sel] });
  }

  async function bulkMove() {
    const picked = await dialog.prompt({
      title: "폴더로 이동",
      label: "옮길 폴더",
      confirmText: "이동",
      options: [
        { value: "", label: "보관함 루트" },
        ...allFolders.map((f) => ({ value: f.id, label: f.name })),
      ],
    });
    if (picked === null) return;
    bulkM.mutate({ action: "move", folderId: picked || null, ids: [...sel] });
  }

  async function newFolder() {
    const name = await dialog.prompt({
      title: "새 폴더",
      label: "폴더 이름 (최대 20자)",
      confirmText: "만들기",
      maxLength: 20,
    });
    if (name) newFolderM.mutate(name);
  }

  async function renameFolder() {
    if (!currentFolder) return;
    const name = await dialog.prompt({
      title: "폴더 이름 변경",
      label: "새 이름 (최대 20자)",
      initial: currentFolder.name,
      maxLength: 20,
    });
    if (name && name !== currentFolder.name) renameFolderM.mutate(name);
  }

  async function deleteFolder() {
    if (!currentFolder) return;
    const ok = await dialog.confirm({
      title: "폴더를 삭제할까요?",
      body: `'${currentFolder.name}' 폴더를 삭제해요. 폴더 안이 비어 있어야 해요.`,
      danger: true,
      confirmText: "삭제",
    });
    if (ok) deleteFolderM.mutate();
  }

  return (
    <main className="mx-auto max-w-[1120px] px-6 py-10 pb-24 sm:py-12">
      {currentFolder && (
        <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <Link href="/" className="shrink-0 hover:text-body">
            보관함
          </Link>
          {trail.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1.5">
              <span aria-hidden>/</span>
              {i === trail.length - 1 ? (
                <span className="max-w-[40vw] truncate text-body">{f.name}</span>
              ) : (
                <Link
                  href={`/?folderId=${f.id}`}
                  className="max-w-[24vw] truncate hover:text-body"
                >
                  {f.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <h1 className="max-w-full truncate text-[28px] font-bold tracking-[-0.01em] text-foreground">
          {currentFolder ? currentFolder.name : "보관함"}
        </h1>

        {currentFolder && (
          <details className="relative [&_summary::-webkit-details-marker]:hidden">
            <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-surface hover:text-body">
              ⋯
            </summary>
            <div className="absolute left-0 top-9 z-10 w-36 overflow-hidden rounded-xl border border-border bg-canvas py-1 shadow-[0_8px_24px_-8px_rgba(25,31,40,0.2)]">
              <button
                onClick={renameFolder}
                className="block w-full px-3.5 py-2 text-left text-[13px] text-body hover:bg-surface"
              >
                이름 변경
              </button>
              <button
                onClick={deleteFolder}
                disabled={deleteFolderM.isPending}
                className="block w-full px-3.5 py-2 text-left text-[13px] text-danger hover:bg-[#fdecee] disabled:opacity-50"
              >
                {deleteFolderM.isPending ? "삭제 중…" : "폴더 삭제"}
              </button>
            </div>
          </details>
        )}

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          {videos.length > 0 && (
            <button
              onClick={() => setSel(selMode ? new Set() : new Set([videos[0].id]))}
              className={`h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-[13px] font-medium transition-colors ${
                selMode
                  ? "border-primary bg-weak-bg text-weak-fg"
                  : "border-border text-body hover:border-primary"
              }`}
            >
              {selMode ? "취소" : "선택"}
            </button>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="정렬"
            className="h-10 shrink-0 rounded-xl border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-primary focus:bg-canvas"
          >
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목 검색"
            aria-label="제목으로 검색"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[14px] outline-none transition-colors focus:border-primary focus:bg-canvas sm:w-[200px] sm:flex-none"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {childFolders.map((f) => (
          <Link
            key={f.id}
            href={`/?folderId=${f.id}`}
            title={f.name}
            className="inline-flex max-w-[200px] items-center gap-1.5 rounded-xl bg-weak-bg px-3.5 py-2 text-[13px] font-medium text-weak-fg transition-transform hover:-translate-y-0.5"
          >
            <span aria-hidden>📁</span>
            <span className="truncate">{f.name}</span>
          </Link>
        ))}
        <button
          onClick={newFolder}
          className="rounded-xl border border-dashed border-border px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
        >
          + 새 폴더
        </button>
        <Link
          href="/trash"
          className="ml-auto rounded-xl px-3 py-2 text-[13px] text-muted hover:bg-surface hover:text-body"
        >
          휴지통
        </Link>
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
          {videos.map((v) => {
            const checked = sel.has(v.id);
            return (
              <Link
                key={v.id}
                href={`/v/${v.id}`}
                onClick={(e) => {
                  if (selMode) {
                    e.preventDefault();
                    toggle(v.id);
                  }
                }}
                className={`group relative overflow-hidden rounded-2xl border bg-canvas transition-all ${
                  checked
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:-translate-y-1 hover:border-primary hover:shadow-[0_8px_24px_-12px_rgba(25,31,40,0.15)]"
                }`}
              >
                {selMode && (
                  <span
                    className={`absolute left-2.5 top-2.5 z-10 grid size-6 place-items-center rounded-full border text-[13px] ${
                      checked
                        ? "border-primary bg-primary text-white"
                        : "border-white bg-foreground/30 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                )}
                <div className="relative aspect-video bg-surface">
                  {v.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbUrl}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-[32px] text-muted/50">
                      ▶
                    </div>
                  )}
                  {v.durationSec != null && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {humanDuration(v.durationSec)}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="truncate text-[15px] font-semibold text-foreground">{v.title}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    {humanSize(v.sizeBytes)} · 조회 {v.viewCount} ·{" "}
                    {new Date(v.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {cursor && (
        <div className="mt-8 text-center">
          <Button variant="ghost" size="md" onClick={loadMore} className="border border-border">
            더 보기
          </Button>
        </div>
      )}

      {selMode && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-canvas/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-6 py-3">
            <span className="text-[14px] font-semibold text-foreground">{sel.size}개 선택</span>
            <button
              onClick={() => setSel(new Set(videos.map((v) => v.id)))}
              className="text-[13px] text-muted hover:text-body"
            >
              전체 선택
            </button>
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="md"
                className="border border-border"
                onClick={bulkMove}
                loading={bulkM.isPending}
              >
                폴더 이동
              </Button>
              <Button variant="danger" size="md" onClick={bulkDelete} loading={bulkM.isPending}>
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
