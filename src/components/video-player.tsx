"use client";

import { useEffect, useRef, useState } from "react";
import { playerBus } from "@/lib/player-bus";

export function VideoPlayer({
  videoId,
  poster,
  playable = null,
  initialUrl = null,
}: {
  videoId: string;
  poster?: string | null;
  playable?: boolean | null;
  initialUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [err, setErr] = useState(false);
  const retried = useRef(false);

  async function load() {
    const res = await fetch(`/api/videos/${videoId}/url?disposition=inline`);
    if (res.ok) {
      setUrl((await res.json()).url);
      setErr(false);
    } else {
      setErr(true);
    }
  }

  async function download() {
    const res = await fetch(`/api/videos/${videoId}/url?disposition=attachment`);
    if (res.ok) window.location.href = (await res.json()).url;
  }

  useEffect(() => {
    if (playable === false || initialUrl) return; // server already handed us a URL
    void load();
  }, [videoId, playable, initialUrl]);

  if (playable === false) {
    return (
      <div
        className="relative grid aspect-video place-items-center bg-black bg-cover bg-center"
        style={poster ? { backgroundImage: `url(${poster})` } : undefined}
      >
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative flex flex-col items-center px-6 text-center">
          <p className="text-[14px] font-medium text-white">
            브라우저에서 재생할 수 없는 형식이에요
          </p>
          <p className="mt-1 text-[12px] text-white/70">
            H.265·ProRes 같은 코덱은 다운로드해서 봐 주세요.
          </p>
          <button
            onClick={download}
            className="mt-3 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-foreground hover:bg-white/90"
          >
            다운로드
          </button>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="grid aspect-video place-items-center bg-surface text-[14px] text-danger">
        영상을 불러오지 못했어요.
      </div>
    );
  }
  if (!url) {
    return <div className="aspect-video w-full animate-pulse bg-surface" />;
  }
  return (
    <video
      key={url}
      ref={(node) => playerBus.attach(node)}
      src={url}
      poster={poster ?? undefined}
      controls
      className="aspect-video w-full bg-black"
      onError={() => {
        if (!retried.current) {
          retried.current = true;
          void load();
        } else {
          setErr(true);
        }
      }}
    />
  );
}
