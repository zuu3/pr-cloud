import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

export const BUCKET = env.S3_BUCKET;

const common = {
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
};

/** Signs URLs the browser will hit — host must be the external endpoint. */
export const s3External = new S3Client({ ...common, endpoint: env.S3_ENDPOINT_EXTERNAL });

/** Server-side S3 calls (Head/List/Complete/Abort/CreateMultipartUpload). */
export const s3Internal = new S3Client({ ...common, endpoint: env.S3_ENDPOINT_INTERNAL });

export function signPutUrl(key: string, contentType: string, ttl = env.PRESIGN_PUT_TTL) {
  return getSignedUrl(
    s3External,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: ttl },
  );
}

export function signGetUrl(
  key: string,
  opts: { disposition?: "inline" | "attachment"; filename?: string; ttl?: number } = {},
) {
  const { disposition, filename, ttl = env.PRESIGN_GET_TTL } = opts;
  const cd = disposition
    ? `${disposition}${filename ? `; filename="${filename}"` : ""}`
    : undefined;
  return getSignedUrl(
    s3External,
    new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: cd }),
    { expiresIn: ttl },
  );
}

export function signUploadPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  ttl = env.PRESIGN_PART_TTL,
) {
  return getSignedUrl(
    s3External,
    new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: ttl },
  );
}
