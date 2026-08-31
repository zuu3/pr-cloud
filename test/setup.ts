// Default env for tests. Individual tests override S3_* / DATABASE_URL after
// spinning up the in-process S3 double or embedded-postgres.
const defaults: Record<string, string> = {
  DATABASE_URL: "postgres://placeholder",
  NEXTAUTH_SECRET: "test-secret",
  NEXTAUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_HD: "school.ac.kr",
  S3_ENDPOINT_EXTERNAL: "http://localhost:9000",
  S3_ENDPOINT_INTERNAL: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "promo-video",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test",
  SEED_ADMIN_EMAIL: "admin@school.ac.kr",
  NEXT_PUBLIC_SINGLE_PUT_MAX_BYTES: "94371840",
};

for (const [k, v] of Object.entries(defaults)) {
  process.env[k] ??= v;
}
