import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_HD: z.string().min(1),
  S3_ENDPOINT_EXTERNAL: z.string().url(),
  S3_ENDPOINT_INTERNAL: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  SEED_ADMIN_EMAIL: z.string().email(),
  PRESIGN_PUT_TTL: z.coerce.number().int().positive().default(900),
  PRESIGN_PART_TTL: z.coerce.number().int().positive().default(3600),
  PRESIGN_GET_TTL: z.coerce.number().int().positive().default(21600),
  SINGLE_PUT_MAX_BYTES: z.coerce.number().int().positive().default(83886080),
  // above this source size we skip building a browser proxy (transcode cost + temp disk). 0 = never.
  PROXY_MAX_SOURCE_BYTES: z.coerce.number().int().nonnegative().default(2147483648),
  // optional storage budget shown on the admin dashboard (e.g. 5TB = 5497558138880)
  STORAGE_QUOTA_BYTES: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new Error(
      "Invalid env: " + r.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  }
  return r.data;
}

// Lazily validated on first property access — importing this module (e.g. from
// tests that only need parseEnv) does not trigger validation.
let cache: Env | undefined;
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    cache ??= parseEnv(process.env);
    return cache[prop as keyof Env];
  },
});
