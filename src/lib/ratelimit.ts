import { HttpError } from "./http";

// In-memory fixed-window limiter. Fine for a single-instance deploy (the school
// VM runs one container). If this ever scales horizontally, back it with Redis.
type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

let sweeping = false;
function startSweeper() {
  if (sweeping) return;
  sweeping = true;
  const t = setInterval(() => {
    const now = Date.now();
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }, 60_000);
  (t as { unref?: () => void }).unref?.();
}

/** true if this call is within the limit for `key`. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  startSweeper();
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (w.count >= limit) return false;
  w.count += 1;
  return true;
}

/** Throws HttpError 429 when the limit is exceeded. */
export function assertRate(key: string, limit: number, windowMs: number): void {
  if (!allow(key, limit, windowMs)) {
    throw new HttpError(429, "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
  }
}
