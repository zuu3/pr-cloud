import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { req } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;

beforeAll(async () => {
  db = await startTestDb();
  m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint,
    S3_ENDPOINT_INTERNAL: m.endpoint,
    S3_REGION: "us-east-1",
    S3_BUCKET: m.bucket,
    S3_ACCESS_KEY: m.accessKey,
    S3_SECRET_KEY: m.secretKey,
  });
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => {
  await db.stop();
  await m.stop();
});

describe("healthz", () => {
  it("200 when db + s3 reachable", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/healthz/route");
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    void req;
  });

  it("503 when bucket wrong", async () => {
    vi.resetModules();
    process.env.S3_BUCKET = "does-not-exist";
    const { GET } = await import("@/app/api/healthz/route");
    const r = await GET();
    expect(r.status).toBe(503);
  });
});
