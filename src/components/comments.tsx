"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { playerBus } from "@/lib/player-bus";

type Comment = {
  id: string;
  author: string;
  body: string;
  atSec: number | null;
  createdAt: string;
};

function mmss(sec: number) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Comments({
  videoId,
  me,
  canModerate,
  isImage,
}: {
  videoId: string;
  me: string;
  canModerate: boolean;
  isImage: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["comments", videoId];
  const { data } = useQuery<{ comments: Comment[] }>({
    queryKey: key,
    queryFn: () => apiFetch(`/api/videos/${videoId}/comments`),
  });
  const comments = data?.comments ?? [];

  const [body, setBody] = useState("");
  const [at, setAt] = useState<number | null>(null);

  const addM = useMutation({
    mutationFn: () =>
      apiFetch(`/api/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: body.trim(), atSec: at }),
      }),
    onSuccess: () => {
      setBody("");
      setAt(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  const delM = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.show(e.message, "err"),
  });

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold text-foreground">
        코멘트 {comments.length > 0 && <span className="text-muted">{comments.length}</span>}
      </h2>

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={isImage ? "코멘트 남기기" : "특정 장면이면 시간을 함께 남겨보세요"}
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] leading-[1.6] text-body outline-none focus:border-primary focus:bg-canvas"
        />
        <div className="flex items-center gap-2">
          {!isImage &&
            (at == null ? (
              <button
                onClick={() => setAt(Math.floor(playerBus.time()))}
                className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-muted hover:border-primary hover:text-primary"
              >
                ⏱ 현재 지점 넣기
              </button>
            ) : (
              <button
                onClick={() => setAt(null)}
                className="rounded-lg border border-primary px-2.5 py-1.5 text-[12px] font-medium text-primary"
              >
                {mmss(at)} · 지우기
              </button>
            ))}
          <Button
            onClick={() => body.trim() && addM.mutate()}
            size="md"
            loading={addM.isPending}
            className="ml-auto"
          >
            남기기
          </Button>
        </div>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-border border-t border-border">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                {c.atSec != null && (
                  <button
                    onClick={() => playerBus.seek(c.atSec!)}
                    className="rounded bg-weak-bg px-1.5 py-0.5 font-medium text-primary tabular-nums hover:bg-primary hover:text-white"
                  >
                    {mmss(c.atSec)}
                  </button>
                )}
                <span className="truncate">{c.author}</span>
                <span>·</span>
                <span>{new Date(c.createdAt).toLocaleDateString("ko-KR")}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[14px] leading-[1.6] text-body">
                {c.body}
              </p>
            </div>
            {(canModerate || c.author === me) && (
              <button
                onClick={() => delM.mutate(c.id)}
                className="shrink-0 self-start rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface hover:text-danger"
              >
                삭제
              </button>
            )}
          </li>
        ))}
        {comments.length === 0 && (
          <li className="py-6 text-center text-[13px] text-muted">첫 코멘트를 남겨보세요.</li>
        )}
      </ul>
    </section>
  );
}
