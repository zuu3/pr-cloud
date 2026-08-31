"use client";

import { useEffect, useRef, useState } from "react";

export function VideoPlayer({
  videoId,
  poster,
}: {
  videoId: string;
  poster?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
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

  useEffect(() => {
    void load();
  }, [videoId]);

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
