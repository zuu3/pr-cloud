export const SCHOOL_DOMAIN =
  process.env.NEXT_PUBLIC_SCHOOL_DOMAIN ?? "bssm.hs.kr";

/** "24.036" -> "24.036@bssm.hs.kr"; leaves a full address untouched. */
export function normalizeEmail(input: string, domain: string = SCHOOL_DOMAIN): string {
  const v = input.trim().toLowerCase();
  if (!v) return v;
  return v.includes("@") ? v : `${v}@${domain}`;
}
