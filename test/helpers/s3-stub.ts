import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";

// In-process S3 double for tests. AWS SDK v3 with forcePathStyle:true talks to it
// over HTTP. Signatures are NOT verified — this validates route wiring, not RGW's
// SigV4. Real RGW checks live in the deploy runbook (spec 6.7).

type Store = {
  buckets: Set<string>;
  objects: Map<string, Buffer>; // `${bucket}/${key}` -> body
  mpu: Map<string, Map<number, Buffer>>; // uploadId -> parts
  cors: Map<string, string>; // bucket -> raw xml
};

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const xml = (s: string) => `<?xml version="1.0" encoding="UTF-8"?>${s}`;

export async function startS3(bucket = "promo-video", port = 0) {
  const store: Store = {
    buckets: new Set([bucket]),
    objects: new Map(),
    mpu: new Map(),
    cors: new Map(),
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const u = new URL(req.url!, "http://s3.local");
      const segs = u.pathname.replace(/^\//, "").split("/");
      const bkt = segs.shift()!;
      const key = decodeURIComponent(segs.join("/"));
      const q = u.searchParams;
      const m = req.method ?? "GET";

      const send = (code: number, payload: string | Buffer = "", headers: Record<string, string> = {}) => {
        res.writeHead(code, headers);
        res.end(payload);
      };
      const okXml = (s: string, code = 200, h: Record<string, string> = {}) =>
        send(code, xml(s), { "content-type": "application/xml", ...h });

      // ---- bucket-level ----
      if (!key) {
        if (m === "PUT" && q.has("cors")) {
          store.cors.set(bkt, body.toString());
          return send(200);
        }
        if (m === "GET" && q.has("cors")) {
          const c = store.cors.get(bkt);
          return c
            ? okXml(c.replace(/^<\?xml[^>]*\?>/, ""))
            : okXml(`<Error><Code>NoSuchCORSConfiguration</Code></Error>`, 404);
        }
        if (m === "PUT" && q.has("lifecycle")) return send(200);
        if (m === "PUT") {
          store.buckets.add(bkt);
          return send(200);
        }
        if (m === "HEAD") return send(store.buckets.has(bkt) ? 200 : 404);
        return send(404);
      }

      const oKey = `${bkt}/${key}`;

      // ---- multipart ----
      if (m === "POST" && q.has("uploads")) {
        const uploadId = "mpu-" + Math.random().toString(36).slice(2);
        store.mpu.set(uploadId, new Map());
        return okXml(
          `<InitiateMultipartUploadResult><Bucket>${bkt}</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
        );
      }
      if (m === "PUT" && q.has("partNumber") && q.has("uploadId")) {
        const parts = store.mpu.get(q.get("uploadId")!);
        if (!parts) return send(404);
        parts.set(Number(q.get("partNumber")), body);
        return send(200, "", { ETag: `"${md5(body)}"` });
      }
      if (m === "GET" && q.has("uploadId")) {
        const parts = store.mpu.get(q.get("uploadId")!);
        if (!parts) return send(404);
        const rows = [...parts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(
            ([n, b]) =>
              `<Part><PartNumber>${n}</PartNumber><ETag>&quot;${md5(b)}&quot;</ETag><Size>${b.length}</Size></Part>`,
          )
          .join("");
        return okXml(`<ListPartsResult><Bucket>${bkt}</Bucket><Key>${key}</Key>${rows}</ListPartsResult>`);
      }
      if (m === "POST" && q.has("uploadId")) {
        const id = q.get("uploadId")!;
        const parts = store.mpu.get(id);
        if (!parts) return send(404);
        const merged = Buffer.concat(
          [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b),
        );
        store.objects.set(oKey, merged);
        store.mpu.delete(id);
        return okXml(
          `<CompleteMultipartUploadResult><Location>http://s3.local/${oKey}</Location><Bucket>${bkt}</Bucket><Key>${key}</Key><ETag>&quot;${md5(merged)}&quot;</ETag></CompleteMultipartUploadResult>`,
        );
      }
      if (m === "DELETE" && q.has("uploadId")) {
        store.mpu.delete(q.get("uploadId")!);
        return send(204);
      }

      // ---- single object ----
      if (m === "PUT") {
        store.objects.set(oKey, body);
        return send(200, "", { ETag: `"${md5(body)}"` });
      }
      if (m === "DELETE") {
        store.objects.delete(oKey);
        return send(204);
      }
      if (m === "HEAD") {
        const o = store.objects.get(oKey);
        return o ? send(200, "", { "content-length": String(o.length) }) : send(404);
      }
      if (m === "GET") {
        const o = store.objects.get(oKey);
        if (!o) return okXml(`<Error><Code>NoSuchKey</Code></Error>`, 404);
        const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) : o.length - 1;
          const slice = o.subarray(start, end + 1);
          return send(206, slice, {
            "content-range": `bytes ${start}-${end}/${o.length}`,
            "content-length": String(slice.length),
            "accept-ranges": "bytes",
          });
        }
        return send(200, o, { "content-length": String(o.length), "accept-ranges": "bytes" });
      }

      send(400);
    });
  });

  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const boundPort = (server.address() as AddressInfo).port;

  return {
    endpoint: `http://127.0.0.1:${boundPort}`,
    accessKey: "test",
    secretKey: "test",
    bucket,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
