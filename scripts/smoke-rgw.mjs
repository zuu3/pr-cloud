// Presigned PUT + GET round-trip against a real RGW/S3 endpoint.
// Validates SigV4 signing, path-style addressing, and bucket write/read —
// without the browser or CORS.
//
//   S3_ENDPOINT_EXTERNAL=https://pr-dept-s3.madp.cloud \
//   S3_BUCKET=pr-dept-bucket S3_REGION=us-east-1 \
//   S3_ACCESS_KEY=... S3_SECRET_KEY=... \
//   node scripts/smoke-rgw.mjs

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`missing env: ${k}`);
    process.exit(1);
  }
  return v;
};

const endpoint = need("S3_ENDPOINT_EXTERNAL");
const Bucket = need("S3_BUCKET");
const region = process.env.S3_REGION || "us-east-1";
const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: need("S3_ACCESS_KEY"), secretAccessKey: need("S3_SECRET_KEY") },
});

const Key = `smoke/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
const body = `smoke ${new Date().toISOString()}`;
const contentType = "text/plain";

const ok = (m) => console.log(`  ok  ${m}`);
const fail = (m, e) => {
  console.error(`  FAIL ${m}`);
  console.error(`       ${e?.message ?? e}`);
  if (e?.$response?.statusCode) console.error(`       HTTP ${e.$response.statusCode}`);
  process.exit(1);
};

console.log(`endpoint ${endpoint}`);
console.log(`bucket   ${Bucket}  (path-style)`);
console.log(`key      ${Key}\n`);

// 1. presign PUT
let putUrl;
try {
  putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket, Key, ContentType: contentType }),
    { expiresIn: 900 },
  );
  ok(`presign PUT  ${putUrl.split("?")[0]}`);
} catch (e) {
  fail("presign PUT", e);
}

// 2. upload via the presigned URL
try {
  const r = await fetch(putUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text().catch(() => "")}`);
  ok(`PUT upload   ETag ${r.headers.get("etag")}`);
} catch (e) {
  fail("PUT upload (check bucket write perms + endpoint reachability)", e);
}

// 3. presign GET + download
try {
  const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 900 });
  const r = await fetch(getUrl);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${text}`);
  if (text !== body) throw new Error(`body mismatch: got ${JSON.stringify(text)}`);
  ok(`GET download bytes match`);
} catch (e) {
  fail("presign GET / download", e);
}

// 4. cleanup
try {
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  ok("cleanup      deleted test object");
} catch (e) {
  console.warn(`  warn cleanup failed (leftover object ${Key}): ${e?.message ?? e}`);
}

console.log("\nall good — SigV4 + path-style + bucket read/write work.");
