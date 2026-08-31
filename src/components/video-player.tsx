"use client";

import { useEffect, useRef, useState } from "react";

export function VideoPlayer({ videoId }: { videoId: string }) {
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
    return <p className="text-[14px] text-danger">영상을 불러오지 못했어요.</p>;
  }
  if (!url) {
    return <div className="aspect-video w-full animate-pulse rounded-xl bg-surface" />;
  }
  return (
    <video
      key={url}
      src={url}
      controls
      className="w-full rounded-xl bg-black"
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
