import {
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { s3Internal, BUCKET } from "../src/lib/s3";
import { env } from "../src/lib/env";

export async function setupBucket(): Promise<void> {
  await s3Internal.send(new CreateBucketCommand({ Bucket: BUCKET })).catch((e: unknown) => {
    const name = String((e as { name?: string })?.name ?? "");
    if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(name)) throw e;
  });

  await s3Internal.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [env.NEXTAUTH_URL],
            AllowedMethods: ["GET", "PUT"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );

  await s3Internal.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: BUCKET,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: "abort-incomplete-mpu",
            Status: "Enabled",
            Filter: { Prefix: "" },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
          },
        ],
      },
    }),
  );

  console.log(`bucket ${BUCKET} ready (cors origin: ${env.NEXTAUTH_URL})`);
}

if (process.argv[1] && process.argv[1].endsWith("setup-bucket.ts")) {
  setupBucket().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
