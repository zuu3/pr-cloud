"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/components/providers";
import { Dropdown } from "@/components/ui/dropdown";

type Entry = {
  id: string;
  actorEmail: string | null;
  actorName: string | null;
  actorImage: string | null;
  action: string;
  targetLabel: string | null;
  at: string;
};
type Page = { entries: Entry[]; nextCursor: string | null };

const LABEL: Record<string, string> = {
  upload: "영상 업로드",
  delete: "영상 삭제",
  "video.trash": "영상을 휴지통으로",
  "video.restore": "영상 복원",
  "video.purge": "영상 영구 삭제",
  "video.move": "영상 이동",
  "video.edit": "영상 정보 수정",
  "video.bulk.trash": "영상 여러 개 휴지통으로",
  "video.bulk.restore": "영상 여러 개 복원",
  "video.bulk.purge": "영상 여러 개 영구 삭제",
  "video.bulk.move": "영상 여러 개 이동",
  "folder.create": "폴더 생성",
  "folder.rename": "폴더 이름 변경",
  "folder.delete": "폴더 삭제",
  "share.create": "공유 링크 생성",
  "share.revoke": "공유 링크 해제",
  "user.invite": "계정 추가",
  "user.remove": "계정 삭제",
  "role.change": "권한 변경",
};

const DANGER = new Set([
  "delete",
  "video.trash",
  "video.purge",
  "video.bulk.trash",
  "video.bulk.purge",
  "folder.delete",
  "user.remove",
  "share.revoke",
]);

const TYPES = [
  ["", "전체 동작"],
  ["video", "영상"],
  ["folder", "폴더"],
  ["share", "공유"],
  ["account", "계정"],
];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({ src, name }: { src: string | null; name: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="size-6 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted">
      {(name ?? "?").slice(0, 1)}
    </span>
  );
}

export function AuditLog() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");

  const { data, fetchNextPage, hasNextPage, isFetching } = useInfiniteQuery<Page>({
    queryKey: ["audit-log", q, type],
    queryFn: ({ pageParam }) =>
      apiFetch(
        `/api/admin/log?${new URLSearchParams({
          ...(q ? { q } : {}),
          ...(type ? { type } : {}),
          ...(pageParam ? { cursor: pageParam as string } : {}),
        })}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Dropdown
          ariaLabel="동작 필터"
          value={type}
          onChange={setType}
          options={TYPES.map(([v, l]) => ({ value: v, label: l }))}
          className="w-[128px]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="계정으로 검색"
          aria-label="로그 검색"
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[14px] outline-none transition-colors focus:border-primary focus:bg-canvas sm:max-w-[240px]"
        />
      </div>

      <ol className="mt-5 border-l border-border">
        {entries.map((e) => (
          <li key={e.id} className="relative pb-5 pl-5 last:pb-0">
            <span
              className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-canvas ${
                DANGER.has(e.action) ? "bg-danger" : "bg-primary"
              }`}
            />
            <p className={`text-[14px] font-semibold ${DANGER.has(e.action) ? "text-danger" : "text-foreground"}`}>
              {LABEL[e.action] ?? e.action}
              {e.targetLabel && (
                <span className="font-normal text-body"> · {e.targetLabel}</span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted">
              <Avatar src={e.actorImage} name={e.actorName ?? e.actorEmail} />
              <span className="max-w-[60vw] truncate">
                {e.actorName ?? e.actorEmail ?? "시스템"}
              </span>
              <span>·</span>
              <span className="shrink-0">{fmt(e.at)}</span>
            </div>
          </li>
        ))}
      </ol>

      {entries.length === 0 && !isFetching && (
        <p className="mt-10 text-center text-[14px] text-muted">기록이 없어요.</p>
      )}

      {hasNextPage && (
        <div className="mt-6 text-center">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetching}
            className="h-10 rounded-lg border border-border bg-canvas px-4 text-[14px] text-body hover:border-primary disabled:opacity-50"
          >
            더 보기
          </button>
        </div>
      )}
    </div>
  );
}
