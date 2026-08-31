import { randomUUID } from "node:crypto";

export function makeVideoKey(ext: string): string {
  const clean = ext.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safe = clean.length > 0 && clean.length <= 8 ? clean : "bin";
  return `promo-video/${new Date().getFullYear()}/${randomUUID()}.${safe}`;
}
