import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startS3 } from "./helpers/s3-stub";

let m: Awaited<ReturnType<typeof startS3>>;
let s3: typeof import("../src/lib/s3");

beforeAll(async () => {
  m = await startS3();
  process.env.S3_ENDPOINT_EXTERNAL = m.endpoint;
  process.env.S3_ENDPOINT_INTERNAL = m.endpoint;
  process.env.S3_REGION = "us-east-1";
  process.env.S3_BUCKET = m.bucket;
  process.env.S3_ACCESS_KEY = m.accessKey;
  process.env.S3_SECRET_KEY = m.secretKey;
  process.env.DATABASE_URL ??= "postgres://x";
  process.env.NEXTAUTH_SECRET ??= "x";
  process.env.NEXTAUTH_URL ??= "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID ??= "x";
  process.env.GOOGLE_CLIENT_SECRET ??= "x";
  process.env.GOOGLE_HD ??= "school.ac.kr";
  process.env.SEED_ADMIN_EMAIL ??= "a@school.ac.kr";
  s3 = await import("../src/lib/s3");
});
afterAll(async () => {
  await m.stop();
});

describe("s3 presign", () => {
  it("round-trips a single PUT then GET", async () => {
    const url = await s3.signPutUrl("promo-video/2026/test.txt", "text/plain");
    const put = await fetch(url, {
      method: "PUT",
      body: "hello",
      headers: { "content-type": "text/plain" },
    });
    expect(put.ok).toBe(true);
    const getUrl = await s3.signGetUrl("promo-video/2026/test.txt");
    const got = await fetch(getUrl);
    expect(await got.text()).toBe("hello");
  });

  it("GET url host is the EXTERNAL endpoint", async () => {
    const getUrl = await s3.signGetUrl("k");
    expect(getUrl.startsWith(process.env.S3_ENDPOINT_EXTERNAL!)).toBe(true);
  });

  it("attachment disposition is signed into the url", async () => {
    const url = await s3.signGetUrl("k", { disposition: "attachment", filename: "my file.mp4" });
    expect(url).toContain("response-content-disposition=");
    expect(decodeURIComponent(url)).toContain('attachment; filename="my file.mp4"');
  });

  it("supports Range on GET", async () => {
    await fetch(await s3.signPutUrl("r.txt", "text/plain"), { method: "PUT", body: "0123456789" });
    const r = await fetch(await s3.signGetUrl("r.txt"), { headers: { Range: "bytes=0-3" } });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("0123");
  });
});
