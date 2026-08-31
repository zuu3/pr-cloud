import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { S3Client, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { startS3 } from "../helpers/s3-stub";

let m: Awaited<ReturnType<typeof startS3>>;

beforeAll(async () => {
  m = await startS3("fresh-bucket");
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint,
    S3_ENDPOINT_INTERNAL: m.endpoint,
    S3_REGION: "us-east-1",
    S3_BUCKET: "fresh-bucket",
    S3_ACCESS_KEY: m.accessKey,
    S3_SECRET_KEY: m.secretKey,
    NEXTAUTH_URL: "https://promo.madp.cloud",
  });
});
afterAll(async () => {
  await m.stop();
});

describe("setupBucket", () => {
  it("applies CORS with the app origin", async () => {
    const { setupBucket } = await import("../../scripts/setup-bucket");
    await setupBucket();

    const c = new S3Client({
      endpoint: m.endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: m.accessKey, secretAccessKey: m.secretKey },
    });
    const cors = await c.send(new GetBucketCorsCommand({ Bucket: "fresh-bucket" }));
    expect(cors.CORSRules?.[0].AllowedOrigins).toContain("https://promo.madp.cloud");
  });
});
