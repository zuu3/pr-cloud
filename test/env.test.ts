import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/lib/env";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  NEXTAUTH_SECRET: "x",
  NEXTAUTH_URL: "https://promo.madp.cloud",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_HD: "school.ac.kr",
  S3_ENDPOINT_EXTERNAL: "https://s3.madp.cloud",
  S3_ENDPOINT_INTERNAL: "https://rgw.internal.madp.cloud",
  S3_REGION: "us-east-1",
  S3_BUCKET: "promo-video",
  S3_ACCESS_KEY: "ak",
  S3_SECRET_KEY: "sk",
  SEED_ADMIN_EMAIL: "admin@school.ac.kr",
};

describe("parseEnv", () => {
  it("applies numeric defaults", () => {
    const e = parseEnv(base);
    expect(e.PRESIGN_PUT_TTL).toBe(900);
    expect(e.PRESIGN_GET_TTL).toBe(21600);
    expect(e.SINGLE_PUT_MAX_BYTES).toBe(83886080);
  });

  it("throws on missing required key", () => {
    const { DATABASE_URL, ...rest } = base;
    void DATABASE_URL;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("coerces numeric overrides", () => {
    expect(parseEnv({ ...base, PRESIGN_GET_TTL: "60" }).PRESIGN_GET_TTL).toBe(60);
  });
});
