"use client";

// Tiny bridge so the comment box can read/seek the one <video> on the detail
// page without threading a ref through server components.
let el: HTMLVideoElement | null = null;

export const playerBus = {
  attach(v: HTMLVideoElement | null) {
    el = v;
  },
  time(): number {
    return el?.currentTime ?? 0;
  },
  seek(sec: number) {
    if (!el) return;
    el.currentTime = sec;
    void el.play?.().catch(() => {});
  },
};
