"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderMenu } from "@/components/folder-menu";
import { PendingUploads } from "@/components/pending-uploads";
import { FolderPicker } from "@/components/folder-picker";
import { SharePanel } from "@/components/share-panel";
import { Dropdown } from "@/components/ui/dropdown";
import { MAX_FOLDER_DEPTH } from "@/lib/folders";
import { IconFolder, IconFilm, IconPlay, IconCheck, IconGrid, IconList } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
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
  playableInBrowser: boolean | null;
  viewCount: number;
  createdAt: string;
  folderId: string | null;
};
type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  coverThumbUrl?: string | null;
  coverVideoId?: string | null;
  coverImageKey?: string | null;
};
type Page = { videos: Video[]; nextCursor: string | null };

const SORTS = [
  ["new", "최신순"],
  ["old", "오래된순"],
  ["title", "제목순"],
  ["size", "용량순"],
  ["views", "조회수순"],
] as const;

const DATE_RANGES = [
  ["", "전체 기간"],
  ["7", "최근 7일"],
  ["30", "최근 30일"],
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
  const [mine, setMine] = useState(params.get("mine") === "1");
  const [days, setDays] = useState(params.get("days") ?? "");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selMode, setSelMode] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverTab, setCoverTab] = useState<"video" | "upload">("video");
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folderId | "" (root)
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useRef(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const animateCards = useRef(true); // stagger only on first mount, not on refetch
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    try {
      const v = localStorage.getItem("videoView");
      if (v === "list" || v === "grid") setView(v);
    } catch {
      /* no storage */
    }
  }, []);
  const setViewPref = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem("videoView", v);
    } catch {
      /* no storage */
    }
  };

  function onCardDragStart(e: React.DragEvent, videoId: string) {
    const ids = sel.has(videoId) && sel.size > 0 ? [...sel] : [videoId];
    e.dataTransfer.setData("text/video-ids", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  }
  function onFolderDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDropTarget(null);
    if (bulkM.isPending) return;
    const raw = e.dataTransfer.getData("text/video-ids");
    if (!raw) return;
    let ids: string[] = [];
    try {
      ids = JSON.parse(raw);
    } catch {
      return;
    }
    if (ids.length === 0 || targetId === (folderId ?? "")) return; // no-op: same folder
    bulkM.mutate({ action: "move", folderId: targetId || null, ids });
  }
  const dropProps = (targetId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(targetId);
    },
    onDragLeave: () => setDropTarget((t) => (t === targetId ? null : t)),
    onDrop: (e: React.DragEvent) => onFolderDrop(e, targetId),
  });

  const allFolders = useMemo(() => folders, [folders]);

  function exitSelect() {
    setSelMode(false);
    setSel(new Set());
  }

  function buildParams(extra?: Record<string, string>) {
    const sp = new URLSearchParams();
    if (folderId) sp.set("folderId", folderId);
    if (q.trim()) sp.set("q", q.trim());
    if (sort !== "new") sp.set("sort", sort);
    if (mine) sp.set("mine", "1");
    if (days) sp.set("days", days);
    for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
    return sp;
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      const sp = buildParams();
      router.replace(sp.toString() ? `/?${sp}` : "/");
      const res = await fetch(`/api/videos?${sp}`);
      if (res.ok) {
        const page: Page = await res.json();
        animateCards.current = false; // no entry stagger on a filter refetch
        setVideos(page.videos);
        setCursor(page.nextCursor);
        exitSelect();
      }
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, folderId, sort, mine, days, router]);

  async function reload() {
    const res = await fetch(`/api/videos?${buildParams()}`);
    if (res.ok) {
      const page: Page = await res.json();
      setVideos(page.videos);
      setCursor(page.nextCursor);
    }
  }

  // refetch when a background upload finishes
  useEffect(() => {
    const h = () => {
      animateCards.current = false;
      void reload();
    };
    window.addEventListener("upload:done", h);
    return () => window.removeEventListener("upload:done", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, folderId, sort, mine, days]);

  // keyboard: "/" focuses search, Esc leaves select mode
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && selMode) {
        exitSelect();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMode]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const sp = buildParams({ cursor });
    const res = await fetch(`/api/videos?${sp}`);
    if (res.ok) {
      const page: Page = await res.json();
      setVideos((v) => [...v, ...page.videos]);
      setCursor(page.nextCursor);
    }
    setLoadingMore(false);
  }

  const selAnchor = useRef<number | null>(null);
  function toggleAt(index: number, shift: boolean) {
    setSel((s) => {
      const n = new Set(s);
      if (shift && selAnchor.current !== null) {
        const [a, b] = [selAnchor.current, index].sort((x, y) => x - y);
        const add = !n.has(videos[index].id);
        for (let k = a; k <= b; k++) {
          if (add) n.add(videos[k].id);
          else n.delete(videos[k].id);
        }
      } else {
        const id = videos[index].id;
        n.has(id) ? n.delete(id) : n.add(id);
      }
      return n;
    });
    selAnchor.current = index;
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
      exitSelect();
      toast.show(v.action === "trash" ? `${data.count}개를 삭제했어요` : `${data.count}개를 옮겼어요`);
      if (v.action === "move" && v.folderId !== (folderId ?? null)) {
        router.push(v.folderId ? `/?folderId=${v.folderId}` : "/");
      }
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

  const coverM = useMutation({
    mutationFn: (coverVideoId: string | null) =>
      apiFetch(`/api/folders/${currentFolder!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coverVideoId }),
      }),
    onSuccess: (_d, coverVideoId) => {
      router.refresh();
      setCoverOpen(false);
      toast.show(coverVideoId ? "커버 이미지를 바꿨어요" : "커버를 자동으로 되돌렸어요");
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const coverUpM = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/folders/${currentFolder!.id}/cover`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "업로드 실패");
    },
    onSuccess: () => {
      router.refresh();
      setCoverOpen(false);
      toast.show("커버 이미지를 올렸어요");
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
    if (sel.size === 0) return;
    const ok = await dialog.confirm({
      title: `${sel.size}개 영상을 삭제할까요?`,
      body: "휴지통으로 옮겨요. 나중에 되살릴 수 있어요.",
      danger: true,
      confirmText: "삭제",
    });
    if (ok) bulkM.mutate({ action: "trash", ids: [...sel] });
  }

  function bulkMoveTo(folderId: string) {
    setMoveOpen(false);
    if (sel.size === 0) return;
    bulkM.mutate({ action: "move", folderId: folderId || null, ids: [...sel] });
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
    let extra = "";
    try {
      const info = await apiFetch(`/api/folders/${currentFolder.id}`);
      const parts: string[] = [];
      if (info.subfolderCount > 0) parts.push(`하위 폴더 ${info.subfolderCount}개`);
      if (info.videoCount > 0) parts.push(`영상 ${info.videoCount}개`);
      extra = parts.length
        ? ` ${parts.join(", ")}가 함께 삭제돼요. 영상은 휴지통으로 갑니다.`
        : "";
    } catch {
      /* fall through with no count hint */
    }
    const ok = await dialog.confirm({
      title: `'${currentFolder.name}' 폴더를 삭제할까요?`,
      body: `이 폴더를 삭제해요.${extra}`,
      danger: true,
      confirmText: "삭제",
    });
    if (ok) deleteFolderM.mutate();
  }

  return (
    <main className="mx-auto max-w-[1120px] px-4 sm:px-6 py-10 pb-24 sm:py-12">
      <PendingUploads />
      {currentFolder && (
        <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <Link
            href="/"
            {...dropProps("")}
            className={`shrink-0 rounded-md px-1 hover:text-body ${
              dropTarget === "" ? "bg-weak-bg text-weak-fg ring-1 ring-primary" : ""
            }`}
          >
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
                  {...dropProps(f.id)}
                  className={`max-w-[24vw] truncate rounded-md px-1 hover:text-body ${
                    dropTarget === f.id ? "bg-weak-bg text-weak-fg ring-1 ring-primary" : ""
                  }`}
                >
                  {f.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="flex min-w-0 max-w-full items-center gap-1">
          <h1 className="truncate text-[28px] font-bold tracking-[-0.01em] text-foreground">
            {currentFolder ? currentFolder.name : "보관함"}
          </h1>
          {currentFolder && (
            <FolderMenu
              onRename={renameFolder}
              onCover={() => setCoverOpen(true)}
              onShare={() => setShareOpen(true)}
              onDownload={() => {
                if (folderId) window.location.href = `/api/download/zip?folderId=${folderId}`;
              }}
              onDelete={deleteFolder}
              deleting={deleteFolderM.isPending}
            />
          )}
        </div>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          {videos.length > 0 && (
            <button
              onClick={() => (selMode ? exitSelect() : setSelMode(true))}
              className={`h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-[13px] font-medium transition-colors ${
                selMode
                  ? "border-primary bg-weak-bg text-weak-fg"
                  : "border-border text-body hover:border-primary"
              }`}
            >
              {selMode ? "취소" : "선택"}
            </button>
          )}
          {videos.length > 0 && (
            <div className="flex h-10 shrink-0 items-center rounded-xl border border-border p-0.5">
              <button
                onClick={() => setViewPref("grid")}
                aria-label="카드 보기"
                aria-pressed={view === "grid"}
                className={`grid h-full w-8 place-items-center rounded-[8px] transition-colors ${
                  view === "grid" ? "bg-weak-bg text-weak-fg" : "text-muted hover:text-body"
                }`}
              >
                <IconGrid className="size-4" />
              </button>
              <button
                onClick={() => setViewPref("list")}
                aria-label="리스트 보기"
                aria-pressed={view === "list"}
                className={`grid h-full w-8 place-items-center rounded-[8px] transition-colors ${
                  view === "list" ? "bg-weak-bg text-weak-fg" : "text-muted hover:text-body"
                }`}
              >
                <IconList className="size-4" />
              </button>
            </div>
          )}
          <Dropdown
            ariaLabel="정렬"
            value={sort}
            onChange={setSort}
            options={SORTS.map(([v, label]) => ({ value: v, label }))}
            className="w-[104px] shrink-0"
          />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목 검색  ( / )"
            aria-label="제목으로 검색"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[14px] outline-none transition-colors focus:border-primary focus:bg-canvas sm:w-[200px] sm:flex-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMine((v) => !v)}
          className={`h-9 shrink-0 rounded-lg border px-3 text-[13px] font-medium transition-colors ${
            mine
              ? "border-primary bg-weak-bg text-weak-fg"
              : "border-border text-body hover:border-primary"
          }`}
        >
          내가 올린 것
        </button>
        <Dropdown
          ariaLabel="기간"
          value={days}
          onChange={setDays}
          options={DATE_RANGES.map(([v, label]) => ({ value: v, label }))}
          className="w-[116px] shrink-0"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {childFolders.map((f) => (
          <Link
            key={f.id}
            href={`/?folderId=${f.id}`}
            title={f.name}
            {...dropProps(f.id)}
            className={`group relative flex h-[88px] w-[148px] shrink-0 flex-col justify-end overflow-hidden rounded-2xl border border-border p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(25,31,40,0.18)] ${
              f.coverThumbUrl ? "bg-foreground" : "bg-weak-bg"
            } ${dropTarget === f.id ? "ring-2 ring-primary ring-offset-1" : ""}`}
          >
            {f.coverThumbUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.coverThumbUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" />
              </>
            )}
            <span
              className={`relative flex items-center gap-1 text-[13px] font-semibold ${
                f.coverThumbUrl ? "text-white" : "text-weak-fg"
              }`}
            >
              <IconFolder className="size-3.5 shrink-0" />
              <span className="truncate">{f.name}</span>
            </span>
          </Link>
        ))}
        {trail.length < MAX_FOLDER_DEPTH && (
          <button
            onClick={newFolder}
            className="flex h-[88px] w-[148px] shrink-0 items-center justify-center rounded-2xl border border-dashed border-border text-[13px] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
          >
            + 새 폴더
          </button>
        )}
        <Link
          href="/trash"
          className="ml-auto self-start rounded-xl px-3 py-2 text-[13px] text-muted hover:bg-surface hover:text-body"
        >
          휴지통
        </Link>
      </div>

      {videos.length === 0 ? (
        <div className="mt-20 flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-surface text-[26px] text-muted">
            <IconFilm />
          </div>
          <p className="mt-4 text-[16px] font-semibold text-foreground">
            {q ? "검색 결과가 없어요" : "아직 올린 영상이 없어요"}
          </p>
          <p className="mt-1 text-[14px] text-muted">
            {q ? "다른 제목으로 찾아보세요." : "첫 영상을 올려보세요."}
          </p>
          {!q && (
            <Link
              href={folderId ? `/upload?folderId=${folderId}` : "/upload"}
              className="mt-5"
            >
              <Button size="md">영상 업로드</Button>
            </Link>
          )}
        </div>
      ) : (
        <div
          className={
            view === "grid"
              ? "mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              : "mt-6 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border"
          }
        >
          {videos.map((v, i) => {
            const checked = sel.has(v.id);

            if (view === "list") {
              return (
                <motion.div
                  key={v.id}
                  initial={animateCards.current ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 14) * 0.015 }}
                >
                  <Link
                    href={`/v/${v.id}`}
                    draggable
                    onDragStart={(e) => onCardDragStart(e, v.id)}
                    onClick={(e) => {
                      if (selMode) {
                        e.preventDefault();
                        toggleAt(i, e.shiftKey);
                      }
                    }}
                    className={`group flex items-center gap-3 px-3 py-2.5 transition-colors ${
                      checked ? "bg-weak-bg" : "bg-canvas hover:bg-surface"
                    }`}
                  >
                    {selMode && (
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded-full border text-[12px] ${
                          checked
                            ? "border-primary bg-primary text-white"
                            : "border-border text-transparent"
                        }`}
                      >
                        <IconCheck className="size-3" />
                      </span>
                    )}
                    <div className="relative h-11 w-[74px] shrink-0 overflow-hidden rounded-md bg-surface">
                      {v.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.thumbUrl}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-[16px] text-muted/40">
                          <IconPlay />
                        </div>
                      )}
                      {v.playableInBrowser === false && (
                        <span className="absolute inset-x-0 bottom-0 bg-foreground/80 text-center text-[9px] font-medium text-white">
                          DL
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-foreground">{v.title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {humanSize(v.sizeBytes)} · 조회 {v.viewCount}
                        {v.durationSec != null ? ` · ${humanDuration(v.durationSec)}` : ""} ·{" "}
                        {new Date(v.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={v.id}
                initial={animateCards.current ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i, 11) * 0.03, ease: "easeOut" }}
                whileTap={{ scale: 0.985 }}
              >
              <Link
                href={`/v/${v.id}`}
                draggable
                onDragStart={(e) => onCardDragStart(e, v.id)}
                onClick={(e) => {
                  if (selMode) {
                    e.preventDefault();
                    toggleAt(i, e.shiftKey);
                  }
                }}
                className={`group relative block overflow-hidden rounded-2xl border bg-canvas transition-all duration-200 ${
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
                    <IconCheck className="size-3.5" />
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
                    <div className="grid size-full place-items-center text-[28px] text-muted/40">
                      <IconPlay />
                    </div>
                  )}
                  {v.durationSec != null && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {humanDuration(v.durationSec)}
                    </span>
                  )}
                  {v.playableInBrowser === false && (
                    <span className="absolute left-2 top-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      다운로드 전용
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
              </motion.div>
            );
          })}
        </div>
      )}

      {cursor && (
        <div className="mt-8 text-center">
          <Button
            variant="ghost"
            size="md"
            onClick={loadMore}
            loading={loadingMore}
            className="border border-border"
          >
            더 보기
          </Button>
        </div>
      )}

      <AnimatePresence>
      {selMode && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-canvas/95 backdrop-blur-sm"
        >
          <div className="mx-auto flex max-w-[1120px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-semibold text-foreground">
                {sel.size > 0 ? `${sel.size}개 선택` : "영상을 선택하세요"}
              </span>
              <button
                onClick={() =>
                  setSel(
                    sel.size === videos.length
                      ? new Set()
                      : new Set(videos.map((v) => v.id)),
                  )
                }
                className="text-[13px] text-muted hover:text-body"
              >
                {sel.size === videos.length && videos.length > 0 ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <div className="flex gap-2 sm:ml-auto [&>button]:flex-1 sm:[&>button]:flex-none">
              <Button
                variant="ghost"
                size="md"
                className="border border-border"
                onClick={() => {
                  if (sel.size === 0) return;
                  window.location.href = `/api/download/zip?ids=${[...sel].join(",")}`;
                }}
                disabled={sel.size === 0}
              >
                ZIP<span className="hidden sm:inline">&nbsp;다운로드</span>
              </Button>
              <Button
                variant="ghost"
                size="md"
                className="border border-border"
                onClick={() => setMoveOpen(true)}
                disabled={sel.size === 0}
                loading={bulkM.isPending}
              >
                폴더 이동
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={bulkDelete}
                disabled={sel.size === 0}
                loading={bulkM.isPending}
              >
                삭제
              </Button>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {moveOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 px-6"
          onClick={() => setMoveOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="w-full max-w-[360px] rounded-2xl bg-canvas p-5 shadow-[0_16px_48px_-12px_rgba(25,31,40,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[17px] font-bold text-foreground">
              {sel.size}개 영상을 옮길 폴더
            </h2>
            <div className="mt-3">
              <FolderPicker folders={allFolders} value="" onChange={bulkMoveTo} />
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="md" onClick={() => setMoveOpen(false)}>
                취소
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {shareOpen && currentFolder && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 px-6"
          onClick={() => setShareOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="w-full max-w-[420px] rounded-2xl bg-canvas p-5 shadow-[0_16px_48px_-12px_rgba(25,31,40,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[17px] font-bold text-foreground">'{currentFolder.name}' 공유</h2>
            <SharePanel folderId={currentFolder.id} />
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="md" onClick={() => setShareOpen(false)}>
                닫기
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {coverOpen && currentFolder && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 px-6"
          onClick={() => setCoverOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="flex max-h-[80vh] w-full max-w-[460px] flex-col rounded-2xl bg-canvas p-5 shadow-[0_16px_48px_-12px_rgba(25,31,40,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[17px] font-bold text-foreground">
              '{currentFolder.name}' 커버 이미지
            </h2>

            <div className="mt-3 flex gap-1 rounded-xl border border-border p-0.5 text-[13px] font-medium">
              <button
                onClick={() => setCoverTab("video")}
                className={`flex-1 rounded-[9px] py-1.5 transition-colors ${
                  coverTab === "video" ? "bg-weak-bg text-weak-fg" : "text-muted hover:text-body"
                }`}
              >
                영상에서 고르기
              </button>
              <button
                onClick={() => setCoverTab("upload")}
                className={`flex-1 rounded-[9px] py-1.5 transition-colors ${
                  coverTab === "upload" ? "bg-weak-bg text-weak-fg" : "text-muted hover:text-body"
                }`}
              >
                직접 올리기
              </button>
            </div>

            {coverTab === "video" ? (
              videos.filter((v) => v.thumbUrl).length === 0 ? (
                <p className="mt-6 text-center text-[13px] text-muted">
                  썸네일이 있는 영상이 없어요. 하위 폴더 영상이 자동으로 커버가 돼요.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 overflow-y-auto">
                  {videos
                    .filter((v) => v.thumbUrl)
                    .map((v) => (
                      <button
                        key={v.id}
                        onClick={() => coverM.mutate(v.id)}
                        disabled={coverM.isPending}
                        className={`relative overflow-hidden rounded-lg border transition-all disabled:opacity-50 ${
                          currentFolder.coverVideoId === v.id
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.thumbUrl!}
                          alt={v.title}
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                </div>
              )
            ) : (
              <div className="mt-4">
                <label className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-border bg-surface px-4 py-10 text-center text-[13px] text-muted transition-colors hover:border-primary">
                  {coverUpM.isPending
                    ? "올리는 중…"
                    : "이미지 파일 선택 (jpg · png · webp · gif, 5MB 이하)"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    hidden
                    disabled={coverUpM.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) coverUpM.mutate(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {currentFolder.coverImageKey && (
                  <p className="mt-2 text-[12px] text-muted">
                    지금 커스텀 이미지가 커버예요. 새로 올리면 교체돼요.
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-between">
              <Button
                variant="ghost"
                size="md"
                onClick={() => coverM.mutate(null)}
                disabled={
                  coverM.isPending ||
                  (!currentFolder.coverVideoId && !currentFolder.coverImageKey)
                }
              >
                자동으로
              </Button>
              <Button variant="ghost" size="md" onClick={() => setCoverOpen(false)}>
                닫기
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </main>
  );
}
