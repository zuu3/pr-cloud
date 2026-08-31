export function humanDuration(sec: number | null): string {
  if (sec == null || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function humanSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  if (i === 0) return `${bytes} B`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}
