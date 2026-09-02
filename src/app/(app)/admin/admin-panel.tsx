"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { humanSize } from "@/lib/format";

type Storage = {
  totalBytes: number;
  totalCount: number;
  trashBytes: number;
  trashCount: number;
  quota: number | null;
  byUser: { email: string; bytes: number; count: number }[];
  byFolder: { folder: string; bytes: number; count: number }[];
};

export function AdminPanel() {
  const toast = useToast();
  const { data: s } = useQuery<Storage>({
    queryKey: ["admin-storage"],
    queryFn: () => apiFetch("/api/admin/storage"),
  });

  const sweep = useMutation({
    mutationFn: () => apiFetch("/api/admin/reconcile", { method: "POST" }),
    onSuccess: (r: { scanned: number; recovered: number; failed: number }) =>
      toast.show(`검사 ${r.scanned} · 복구 ${r.recovered} · 실패 처리 ${r.failed}`),
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const regen = useMutation({
    mutationFn: () => apiFetch("/api/admin/regenerate-media", { method: "POST" }),
    onSuccess: (r: { queued: number }) =>
      toast.show(
        r.queued > 0
          ? `${r.queued}개 영상의 썸네일·재생정보를 다시 만들고 있어요`
          : "다시 만들 영상이 없어요",
      ),
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const transcode = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/regenerate-media?transcode=1", { method: "POST" }),
    onSuccess: (r: { queued: number }) =>
      toast.show(
        r.queued > 0
          ? `${r.queued}개 영상을 브라우저 재생용으로 변환하고 있어요 (몇 분 걸려요)`
          : "변환할 영상이 없어요",
      ),
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const pct = s?.quota ? Math.min(100, Math.round((s.totalBytes / s.quota) * 100)) : null;

  return (
    <section className="rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-foreground">저장 용량</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="md"
            className="border border-border"
            loading={regen.isPending}
            onClick={() => regen.mutate()}
          >
            메타데이터 재생성
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="border border-border"
            loading={transcode.isPending}
            onClick={() => transcode.mutate()}
          >
            브라우저 재생용 변환
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="border border-border"
            loading={sweep.isPending}
            onClick={() => sweep.mutate()}
          >
            미완료 업로드 정리
          </Button>
        </div>
      </div>

      {!s ? (
        <p className="mt-4 text-[13px] text-muted">불러오는 중…</p>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-foreground">
                {humanSize(s.totalBytes)}
                <span className="ml-1.5 font-normal text-muted">영상 {s.totalCount}개</span>
              </span>
              {s.quota && (
                <span className="text-muted">
                  {pct}% · 한도 {humanSize(s.quota)}
                </span>
              )}
            </div>
            {s.quota && (
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full ${pct! >= 90 ? "bg-danger" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            <p className="mt-1.5 text-[12px] text-muted">
              휴지통 {humanSize(s.trashBytes)} · {s.trashCount}개 (한도에 포함)
            </p>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <RankList title="사용자별" rows={s.byUser.map((r) => ({ label: r.email, ...r }))} />
            <RankList title="폴더별" rows={s.byFolder.map((r) => ({ label: r.folder, ...r }))} />
          </div>
        </>
      )}
    </section>
  );
}

function RankList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; bytes: number; count: number }[];
}) {
  const max = rows[0]?.bytes || 1;
  return (
    <div>
      <p className="text-[12px] font-medium text-muted">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.length === 0 && <li className="text-[13px] text-muted">없음</li>}
        {rows.map((r) => (
          <li key={r.label} className="text-[13px]">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-body">{r.label}</span>
              <span className="shrink-0 text-muted">{humanSize(r.bytes)}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary/50"
                style={{ width: `${Math.max(3, Math.round((r.bytes / max) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
