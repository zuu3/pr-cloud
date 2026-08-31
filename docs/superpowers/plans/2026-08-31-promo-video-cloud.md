# 홍보부 영상저장 클라우드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홍보부 전용 영상 저장 웹앱 — 학교 Google 로그인, 브라우저→Ceph RGW presigned 직접 업로드(대용량 multipart+재개), 스트리밍 재생, 다운로드, 비로그인 공유 링크.

**Architecture:** Next.js(App Router) 단일 앱. 앱 서버는 파일 바이트를 통과시키지 않고 presigned URL만 발급하는 "티켓 발급기". 파일은 브라우저 ↔ RGW 직결. 메타데이터는 Trove PostgreSQL. Docker로 Nova VM 배포.

**Tech Stack:** Next.js 15 · TypeScript · Auth.js v5 (Google) · Prisma + PostgreSQL 15 · `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` · Uppy (`@uppy/core`, `@uppy/react`, `@uppy/dashboard`, `@uppy/aws-s3`) · Tailwind · Vitest (PGlite + in-process S3 stub, no Docker) · Playwright

## Global Constraints

- Node >= 20. `package.json` `"engines": { "node": ">=20" }`.
- Next.js `output: "standalone"`.
- **테스트는 로컬 Docker를 쓰지 않는다.** `npm test` = 100% 인프로세스: DB는 PGlite(`@electric-sql/pglite` + `@prisma/adapter-pglite`, Prisma `previewFeatures=["driverAdapters"]`), S3는 `node:http` 인메모리 더블(`test/helpers/s3-stub.ts`). e2e(Playwright)만 실제 Postgres 필요 → CI 전용(GitHub Actions `services: postgres`), 로컬 실행은 선택.
- `Dockerfile`/`docker-compose.yml` 은 **배포 전용** (Nova VM). 로컬 테스트와 무관.
- 앱 서버는 영상 바이트를 프록시하지 않는다. 모든 파일 전송은 presigned URL로 브라우저↔RGW 직결. (프록시 폴백은 별도 계획, 이 계획 범위 밖.)
- S3 클라이언트 2개 분리: `s3External`(host `S3_ENDPOINT_EXTERNAL`, presigned URL 서명 전용) / `s3Internal`(host `S3_ENDPOINT_INTERNAL`, 서버측 Head/List/Complete/Abort/CreateMultipartUpload 호출).
- 모든 S3 config: `region: S3_REGION`, `forcePathStyle: true`, `signatureVersion` v4 (SDK v3 기본).
- Multipart 파트 크기 고정 `PART_SIZE = 67108864` (64 MiB).
- 단일 PUT 임계값 `SINGLE_PUT_MAX_BYTES` env (기본 `94371840` = 90 MiB). 초과 파일은 multipart 강제.
- Role 2종: `member` / `admin`. 로그인 허용 = `users` 테이블에 email 존재. `admin`만 `/api/admin/*`, `/admin`.
- presigned TTL: PUT 900s, UploadPart 3600s, GET 21600s. 전부 env override.
- 모든 mutation은 `audit_log`에 기록.
- 커밋 자주. 각 Task 끝 = independently testable deliverable + 커밋.
- 커밋 메시지 말미:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Eq1RVHTU8b7wWdVjFTacY2
  ```

## Design direction

**oh-my-design (OMD) `DESIGN.md` 를 단일 소스로 사용.** Task 0에서 Toss 레퍼런스 기반
프로젝트 `DESIGN.md` 를 repo root에 생성. 모든 UI Task(16~20)는 그 파일의
타이포/컬러/스페이싱/보이스/금지패턴을 따른다. 컴포넌트 라이브러리 없음 — Tailwind 유틸리티만.
- Tailwind config 의 색/폰트/radius 토큰은 `DESIGN.md` 값으로 채운다 (임의값 금지).
- 마이크로카피 한국어, `DESIGN.md` 보이스 가이드 준수.
- Google Drive식 조밀한 파일 테이블 지양 — 카드 그리드.
- 다크모드 v1 제외.

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/env.ts` | env 파싱·검증 (zod). 부팅 시 누락 즉시 실패. |
| `src/lib/db.ts` | `prisma` 싱글턴. |
| `src/lib/s3.ts` | `s3External`/`s3Internal` 클라이언트, `BUCKET`, presign 헬퍼. |
| `src/lib/keys.ts` | `makeVideoKey(ext)` → `promo-video/{YYYY}/{uuid}.{ext}`. |
| `src/lib/auth.ts` | Auth.js 설정, `auth()`, `requireUser()`, `requireAdmin()`. |
| `src/lib/audit.ts` | `logAudit(actor, action, targetId?)`. |
| `src/lib/uploads.ts` | `PART_SIZE`, `SINGLE_PUT_MAX`, `assertUploadOwner()`. |
| `src/lib/http.ts` | route handler용 `json()`, `httpError()`, `HttpError`. |
| `prisma/schema.prisma` | 데이터 모델. |
| `src/app/api/**` | route handlers (아래 Task별). |
| `src/app/(app)/**` | 로그인 필요 페이지 (shell, list, upload, detail, admin). |
| `src/app/login/page.tsx` | 로그인. |
| `src/app/s/[token]/page.tsx` + `src/app/s/[token]/url/route.ts` | 공유 페이지 + presigned redirect. |
| `test/helpers/pg.ts` | PGlite 인프로세스 Postgres + 마이그레이션 SQL 적용. `startTestDb()`. |
| `test/helpers/s3-stub.ts` | `node:http` 인메모리 S3 더블. `startS3()` (기존 `startMinio` 대체 — import 이름만 교체). |
| `test/helpers/req.ts` | route handler 호출용 `Request` 빌더 + mock 세션. |
| `DESIGN.md` | OMD 생성 (Task 0). UI 작업의 디자인 소스. |
| `.github/workflows/ci.yml` | test(인프로세스) + build + e2e(postgres 서비스) 잡. |
| `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh` | 배포. |
| `scripts/setup-bucket.ts` | 버킷 생성 + CORS + lifecycle 적용. |
| `e2e/upload.spec.ts` | Playwright happy-path. |

---

## Phase 0 — Scaffold & tooling

### Task 0: oh-my-design DESIGN.md (Toss reference)

**Files:**
- Create: `DESIGN.md` (repo root, via OMD)

**Interfaces:**
- Produces: `DESIGN.md` — Toss 기반 프로젝트 디자인 시스템 (타이포 스케일, 컬러 토큰, radius/spacing, 보이스 가이드, 금지 패턴). Task 16~20의 유일한 디자인 소스.

- [ ] **Step 1: OMD 스킬 설치**

```bash
npx oh-my-design-cli@latest install-skills --agent claude-code --all
npx oh-my-design-cli@latest doctor
```
Expected: `omd:*` 스킬이 `.claude/skills/` (or 글로벌)에 설치됨.

- [ ] **Step 2: 프로젝트 DESIGN.md 생성**

`omd:init` 실행. 프롬프트: "영상 저장/공유 웹앱(홍보부 내부용). Toss를 레퍼런스로. 검증된 레퍼런스 사실만 유지, 제품 특유 결정은 먼저 질문." → 카탈로그에서 Toss 추천 확인 → `DESIGN.md` repo root에 기록.

- [ ] **Step 3: 확인**

`DESIGN.md` 에 최소: primary 색 HEX, 폰트 패밀리, 타이포 스케일, radius 값, 버튼/입력 스펙, 보이스 원칙, 금지 패턴이 있는지 육안 확인. 없으면 `omd:init` 재실행하거나 수동 보완.

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md .claude
git commit -m "chore: add Toss-based DESIGN.md via oh-my-design"
```

### Task 1: Next.js + TS + Tailwind + Vitest scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `.gitignore`, `.eslintrc.json`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Create: `src/lib/env.ts`
- Test: `test/env.test.ts`

**Interfaces:**
- Produces: `src/lib/env.ts` → `export const env: { DATABASE_URL: string; NEXTAUTH_SECRET: string; NEXTAUTH_URL: string; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_HD: string; S3_ENDPOINT_EXTERNAL: string; S3_ENDPOINT_INTERNAL: string; S3_REGION: string; S3_BUCKET: string; S3_ACCESS_KEY: string; S3_SECRET_KEY: string; SEED_ADMIN_EMAIL: string; PRESIGN_PUT_TTL: number; PRESIGN_PART_TTL: number; PRESIGN_GET_TTL: number; SINGLE_PUT_MAX_BYTES: number }`
- Produces: `parseEnv(raw: Record<string, string | undefined>): typeof env` (테스트에서 직접 호출)

- [ ] **Step 1: Init project**

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --no-import-alias --use-npm
```

Then edit `package.json`: add `"engines": { "node": ">=20 <21" }`, add scripts:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test"
}
```

- [ ] **Step 2: Add deps**

```bash
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner next-auth@beta @auth/prisma-adapter @prisma/client @prisma/adapter-pglite @electric-sql/pglite zod nanoid
npm i -D vitest @vitejs/plugin-react vite-tsconfig-paths prisma tsx @playwright/test @testing-library/react @testing-library/dom jsdom
```

`prisma/schema.prisma` generator 에 `previewFeatures = ["driverAdapters"]` 추가 (Task 2에서 스키마 작성 시 포함).
`package.json` `"engines": { "node": ">=20" }`.

- [ ] **Step 3: `next.config.ts` + `vitest.config.ts`**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
```

- [ ] **Step 4: Write the failing test**

`test/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/lib/env";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  NEXTAUTH_SECRET: "x", NEXTAUTH_URL: "https://promo.madp.cloud",
  GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_HD: "school.ac.kr",
  S3_ENDPOINT_EXTERNAL: "https://s3.madp.cloud",
  S3_ENDPOINT_INTERNAL: "https://rgw.internal.madp.cloud",
  S3_REGION: "us-east-1", S3_BUCKET: "promo-video",
  S3_ACCESS_KEY: "ak", S3_SECRET_KEY: "sk",
  SEED_ADMIN_EMAIL: "admin@school.ac.kr",
};

describe("parseEnv", () => {
  it("applies numeric defaults", () => {
    const e = parseEnv(base);
    expect(e.PRESIGN_PUT_TTL).toBe(900);
    expect(e.PRESIGN_GET_TTL).toBe(21600);
    expect(e.SINGLE_PUT_MAX_BYTES).toBe(94371840);
  });
  it("throws on missing required key", () => {
    const { DATABASE_URL, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });
  it("coerces numeric overrides", () => {
    expect(parseEnv({ ...base, PRESIGN_GET_TTL: "60" }).PRESIGN_GET_TTL).toBe(60);
  });
});
```

- [ ] **Step 5: Run test — expect FAIL**

Run: `npm test -- test/env.test.ts`
Expected: FAIL, `parseEnv` not exported / module missing.

- [ ] **Step 6: Implement `src/lib/env.ts`**

```ts
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
  SINGLE_PUT_MAX_BYTES: z.coerce.number().int().positive().default(94371840),
});

export function parseEnv(raw: Record<string, string | undefined>) {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new Error("Invalid env: " + r.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  return r.data;
}

export const env = parseEnv(process.env);
```

- [ ] **Step 7: Run test — expect PASS**

Run: `npm test -- test/env.test.ts`
Expected: PASS (3).

- [ ] **Step 8: `.env.example`**

```
DATABASE_URL=postgres://promo:promo@localhost:5432/promovideo
NEXTAUTH_SECRET=changeme
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_HD=school.ac.kr
S3_ENDPOINT_EXTERNAL=http://localhost:9000
S3_ENDPOINT_INTERNAL=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=promo-video
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
SEED_ADMIN_EMAIL=admin@school.ac.kr
PRESIGN_PUT_TTL=900
PRESIGN_PART_TTL=3600
PRESIGN_GET_TTL=21600
SINGLE_PUT_MAX_BYTES=94371840
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app + env validation"
```

### Task 2: Prisma schema + migration + test DB helper

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `test/helpers/pg.ts`
- Test: `test/schema.test.ts`

**Interfaces:**
- Consumes: `env.DATABASE_URL` from Task 1.
- Produces: `src/lib/db.ts` → `export const prisma: PrismaClient`.
- Produces: `test/helpers/pg.ts` → `export async function startTestDb(): Promise<{ prisma: PrismaClient; url: string; stop: () => Promise<void> }>` (PGlite 인프로세스 Postgres, 마이그레이션 SQL 파일 순차 적용 완료 상태로 반환).
- Produces (models): `User { email PK, role, status, name?, googleSub?, createdAt }`, `Folder { id, name, parentId?, createdBy?, createdAt }`, `Video { id, folderId?, title, description?, s3Key unique, sizeBytes?, contentType?, originalFilename, status, durationSec?, thumbKey?, uploadedBy?, createdAt, updatedAt }`, `Upload { videoId PK, s3UploadId, partSize, partsJson Json, createdAt }`, `ShareLink { id, token unique, videoId, expiresAt?, createdBy?, createdAt, revokedAt? }`, `AuditLog { id BigInt autoincrement, actorEmail?, action, targetId?, at }`.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js"; previewFeatures = ["driverAdapters"] }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role { member admin }
enum UserStatus { invited active }
enum VideoStatus { pending uploading ready failed }

model User {
  email     String     @id
  role      Role       @default(member)
  status    UserStatus @default(invited)
  name      String?
  googleSub String?    @unique
  createdAt DateTime   @default(now())
}

model Folder {
  id        String   @id @default(uuid())
  name      String
  parentId  String?
  parent    Folder?  @relation("FolderTree", fields: [parentId], references: [id], onDelete: Restrict)
  children  Folder[] @relation("FolderTree")
  createdBy String?
  createdAt DateTime @default(now())
  videos    Video[]
}

model Video {
  id               String      @id @default(uuid())
  folderId         String?
  folder           Folder?     @relation(fields: [folderId], references: [id], onDelete: Restrict)
  title            String
  description      String?
  s3Key            String      @unique
  sizeBytes        BigInt?
  contentType      String?
  originalFilename String
  status           VideoStatus @default(pending)
  durationSec      Int?
  thumbKey         String?
  uploadedBy       String?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  upload           Upload?
  shareLinks       ShareLink[]
}

model Upload {
  videoId    String   @id
  video      Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  s3UploadId String
  partSize   Int
  partsJson  Json     @default("[]")
  createdAt  DateTime @default(now())
}

model ShareLink {
  id        String    @id @default(uuid())
  token     String    @unique
  videoId   String
  video     Video     @relation(fields: [videoId], references: [id], onDelete: Cascade)
  expiresAt DateTime?
  createdBy String?
  createdAt DateTime  @default(now())
  revokedAt DateTime?
}

model AuditLog {
  id         BigInt   @id @default(autoincrement())
  actorEmail String?
  action     String
  targetId   String?
  at         DateTime @default(now())
}
```

- [ ] **Step 2: Generate client + first migration**

```bash
npx prisma generate
# 로컬 postgres 없이도 migration SQL 만 생성:
npx prisma migrate dev --name init --create-only
```

Review generated SQL in `prisma/migrations/*/migration.sql`. Confirm enums + tables present.

- [ ] **Step 3: `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```

- [ ] **Step 4: `test/helpers/pg.ts`** (PGlite, no Docker)

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "@prisma/adapter-pglite";
import { PrismaClient } from "@prisma/client";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

export async function startTestDb() {
  const pg = new PGlite(); // in-memory, per-call isolated
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const d of dirs) {
    const sql = readFileSync(join(MIGRATIONS_DIR, d, "migration.sql"), "utf8");
    await pg.exec(sql);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  return {
    prisma,
    stop: async () => { await prisma.$disconnect(); await pg.close(); },
  };
}
```

Note: integration tests call `startTestDb()` and `vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }))` — unchanged. `db.url` 반환 없음(테스트에서 미사용).

- [ ] **Step 5: Write the failing test**

`test/schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db.stop(); });

describe("schema", () => {
  it("inserts a user and a video with defaults", async () => {
    await db.prisma.user.create({ data: { email: "a@school.ac.kr", role: "admin" } });
    const v = await db.prisma.video.create({
      data: { title: "t", s3Key: "promo-video/2026/x.mp4", originalFilename: "x.mp4" },
    });
    expect(v.status).toBe("pending");
    const u = await db.prisma.user.findUniqueOrThrow({ where: { email: "a@school.ac.kr" } });
    expect(u.status).toBe("invited");
  });

  it("rejects duplicate s3Key", async () => {
    await db.prisma.video.create({ data: { title: "t2", s3Key: "dup", originalFilename: "y" } });
    await expect(
      db.prisma.video.create({ data: { title: "t3", s3Key: "dup", originalFilename: "z" } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run — expect FAIL then PASS**

Run: `npm test -- test/schema.test.ts`
First run may FAIL if Docker not running — ensure Docker daemon up. Expected after fix: PASS (2).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: prisma schema + test db helper"
```

---

## Phase 1 — Core libs: S3, keys, http, auth, audit

### Task 3: S3 clients + presign helpers

**Files:**
- Create: `src/lib/s3.ts`, `test/helpers/s3-stub.ts`
- Test: `test/s3.test.ts`

**Interfaces:**
- Consumes: `env` from Task 1.
- Produces: `src/lib/s3.ts` →
  - `export const BUCKET: string`
  - `export const s3External: S3Client` (endpoint `env.S3_ENDPOINT_EXTERNAL`)
  - `export const s3Internal: S3Client` (endpoint `env.S3_ENDPOINT_INTERNAL`)
  - `export function signPutUrl(key: string, contentType: string, ttl?: number): Promise<string>`
  - `export function signGetUrl(key: string, opts?: { disposition?: "inline" | "attachment"; filename?: string; ttl?: number }): Promise<string>`
  - `export function signUploadPartUrl(key: string, uploadId: string, partNumber: number, ttl?: number): Promise<string>`
- Produces: `test/helpers/s3-stub.ts` → `export async function startS3(bucket?): Promise<{ endpoint: string; accessKey: string; secretKey: string; bucket: string; stop: () => Promise<void> }>` (node:http 인메모리 S3 더블, `promo-video` 버킷 사전 등록).

- [ ] **Step 1: `test/helpers/s3-stub.ts`** (in-process `node:http` S3 double, no Docker)

순수 Node HTTP 서버. AWS SDK v3 (path-style, `forcePathStyle:true`) 요청을 받아 메모리 Map에 저장.
서명 검증 안 함 (라우트 wiring 검증이 목적; 실제 RGW SigV4 확인은 배포 런북 6.7).

구현할 op (path-style: `/{bucket}/{key...}` 또는 `/{bucket}?...`):
- `PUT /{bucket}/{key}` (쿼리에 `partNumber`+`uploadId` 없을 때) → 오브젝트 저장. `ETag` 헤더 = `"` + md5(body) hex + `"`.
- `GET /{bucket}/{key}` → 200 전체 또는 `Range: bytes=a-b` → 206 + `Content-Range` + 슬라이스. 없으면 404 (`<Error><Code>NoSuchKey</Code></Error>`).
- `HEAD /{bucket}/{key}` → 200 + `Content-Length`. 없으면 404.
- `HEAD /{bucket}` → 버킷 존재하면 200, 아니면 404.
- `DELETE /{bucket}/{key}` → 204, 오브젝트 삭제.
- `POST /{bucket}/{key}?uploads` → `CreateMultipartUpload`. `uploadId` 발급(랜덤). XML `<InitiateMultipartUploadResult><Bucket/><Key/><UploadId/></...>`.
- `PUT /{bucket}/{key}?partNumber=N&uploadId=U` → 파트 body 저장(`U` 별 Map<N, Buffer>). `ETag` 헤더 반환.
- `GET /{bucket}/{key}?uploadId=U` → `ListParts`. XML `<ListPartsResult>` + 각 `<Part><PartNumber/><ETag/><Size/></Part>`.
- `POST /{bucket}/{key}?uploadId=U` (body = CompleteMultipartUpload XML) → 파트를 PartNumber 순 concat → 오브젝트 저장 → Map<U> 삭제. XML `<CompleteMultipartUploadResult><Location/><Bucket/><Key/><ETag/></...>`.
- `DELETE /{bucket}/{key}?uploadId=U` → `AbortMultipartUpload`. Map<U> 삭제. 204.
- `PUT /{bucket}?cors` → body(XML) 저장. `GET /{bucket}?cors` → 저장된 XML 반환 (`GetBucketCorsCommand` 파싱용). 없으면 404 `NoSuchCORSConfiguration`.
- `PUT /{bucket}?lifecycle` → 200 (내용 무시).
- `PUT /{bucket}` (create bucket) → 200, 버킷 등록.

```ts
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";

type Store = {
  buckets: Set<string>;
  objects: Map<string, Buffer>;                 // `${bucket}/${key}` -> body
  mpu: Map<string, Map<number, Buffer>>;        // uploadId -> parts
  mpuKey: Map<string, string>;                  // uploadId -> `${bucket}/${key}`
  cors: Map<string, string>;                    // bucket -> raw xml
};

function md5(b: Buffer) { return createHash("md5").update(b).digest("hex"); }
function xml(s: string) { return `<?xml version="1.0" encoding="UTF-8"?>${s}`; }

export async function startS3(bucket = "promo-video") {
  const store: Store = { buckets: new Set([bucket]), objects: new Map(), mpu: new Map(), mpuKey: new Map(), cors: new Map() };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const u = new URL(req.url!, "http://s3.local");
      const parts = u.pathname.replace(/^\//, "").split("/");
      const bkt = parts.shift()!;
      const key = decodeURIComponent(parts.join("/"));
      const q = u.searchParams;
      const send = (code: number, payload = "", headers: Record<string, string> = {}) => {
        res.writeHead(code, headers); res.end(payload);
      };
      const okXml = (s: string, code = 200, h: Record<string, string> = {}) =>
        send(code, xml(s), { "content-type": "application/xml", ...h });

      // bucket-level
      if (!key) {
        if (req.method === "PUT" && q.has("cors")) { store.cors.set(bkt, body.toString()); return send(200); }
        if (req.method === "GET" && q.has("cors")) {
          const c = store.cors.get(bkt);
          return c ? okXml(c.replace(/^<\?xml[^>]*\?>/, "")) : okXml(`<Error><Code>NoSuchCORSConfiguration</Code></Error>`, 404);
        }
        if (req.method === "PUT" && q.has("lifecycle")) return send(200);
        if (req.method === "PUT") { store.buckets.add(bkt); return send(200); }
        if (req.method === "HEAD") return send(store.buckets.has(bkt) ? 200 : 404);
        return send(404);
      }
      const oKey = `${bkt}/${key}`;

      // multipart
      if (req.method === "POST" && q.has("uploads")) {
        const uploadId = "mpu-" + Math.random().toString(36).slice(2);
        store.mpu.set(uploadId, new Map()); store.mpuKey.set(uploadId, oKey);
        return okXml(`<InitiateMultipartUploadResult><Bucket>${bkt}</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`);
      }
      if (req.method === "PUT" && q.has("partNumber") && q.has("uploadId")) {
        const m = store.mpu.get(q.get("uploadId")!); if (!m) return send(404);
        m.set(Number(q.get("partNumber")), body);
        return send(200, "", { ETag: `"${md5(body)}"` });
      }
      if (req.method === "GET" && q.has("uploadId")) {
        const m = store.mpu.get(q.get("uploadId")!); if (!m) return send(404);
        const rows = [...m.entries()].sort((a, b) => a[0] - b[0])
          .map(([n, b]) => `<Part><PartNumber>${n}</PartNumber><ETag>"${md5(b)}"</ETag><Size>${b.length}</Size></Part>`).join("");
        return okXml(`<ListPartsResult><Bucket>${bkt}</Bucket><Key>${key}</Key>${rows}</ListPartsResult>`);
      }
      if (req.method === "POST" && q.has("uploadId")) {
        const id = q.get("uploadId")!; const m = store.mpu.get(id); if (!m) return send(404);
        const merged = Buffer.concat([...m.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b));
        store.objects.set(oKey, merged); store.mpu.delete(id); store.mpuKey.delete(id);
        return okXml(`<CompleteMultipartUploadResult><Location>http://s3.local/${oKey}</Location><Bucket>${bkt}</Bucket><Key>${key}</Key><ETag>"${md5(merged)}"</ETag></CompleteMultipartUploadResult>`);
      }
      if (req.method === "DELETE" && q.has("uploadId")) {
        store.mpu.delete(q.get("uploadId")!); return send(204);
      }

      // single object
      if (req.method === "PUT") { store.objects.set(oKey, body); return send(200, "", { ETag: `"${md5(body)}"` }); }
      if (req.method === "DELETE") { store.objects.delete(oKey); return send(204); }
      if (req.method === "HEAD") {
        const o = store.objects.get(oKey);
        return o ? send(200, "", { "content-length": String(o.length) }) : send(404);
      }
      if (req.method === "GET") {
        const o = store.objects.get(oKey);
        if (!o) return okXml(`<Error><Code>NoSuchKey</Code></Error>`, 404);
        const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
        if (range) {
          const start = Number(range[1]); const end = range[2] ? Number(range[2]) : o.length - 1;
          const slice = o.subarray(start, end + 1);
          return send(206, slice.toString("binary"), {
            "content-range": `bytes ${start}-${end}/${o.length}`, "content-length": String(slice.length),
          });
        }
        return send(200, o.toString("binary"), { "content-length": String(o.length) });
      }
      send(400);
    });
  });

  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    accessKey: "test", secretKey: "test", bucket,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
```

Note: 기존 통합 테스트들의 `import { startMinio } from "../helpers/minio"` → `import { startS3 } from "../helpers/s3-stub"` 로, 호출 `startS3()` → `startS3()` 로 교체 (Tasks 10, 11, 13, 14, 15, 21, 23). 반환 shape 동일(`endpoint/accessKey/secretKey/bucket/stop`).
바이너리 응답을 `toString("binary")` 로 보내므로 텍스트 픽스처면 충분. e2e의 실제 영상 바이트는 CI의 실제 Postgres + 이 stub 대신 실제 MinIO 서비스로 검증(Task 24).

- [ ] **Step 2: Write the failing test**

`test/s3.test.ts`:
```ts
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
  // 나머지 필수 env 채우기
  process.env.DATABASE_URL ??= "postgres://x";
  process.env.NEXTAUTH_SECRET ??= "x";
  process.env.NEXTAUTH_URL ??= "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID ??= "x";
  process.env.GOOGLE_CLIENT_SECRET ??= "x";
  process.env.GOOGLE_HD ??= "school.ac.kr";
  process.env.SEED_ADMIN_EMAIL ??= "a@school.ac.kr";
  s3 = await import("../src/lib/s3");
});
afterAll(async () => { await m.stop(); });

describe("s3 presign", () => {
  it("round-trips a single PUT then GET", async () => {
    const url = await s3.signPutUrl("promo-video/2026/test.txt", "text/plain");
    const put = await fetch(url, { method: "PUT", body: "hello", headers: { "content-type": "text/plain" } });
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
```

- [ ] **Step 3: Run — expect FAIL** (`src/lib/s3` missing)

Run: `npm test -- test/s3.test.ts`

- [ ] **Step 4: Implement `src/lib/s3.ts`**

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

export const BUCKET = env.S3_BUCKET;

const common = {
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
};

export const s3External = new S3Client({ ...common, endpoint: env.S3_ENDPOINT_EXTERNAL });
export const s3Internal = new S3Client({ ...common, endpoint: env.S3_ENDPOINT_INTERNAL });

export function signPutUrl(key: string, contentType: string, ttl = env.PRESIGN_PUT_TTL) {
  return getSignedUrl(s3External, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: ttl });
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

export function signUploadPartUrl(key: string, uploadId: string, partNumber: number, ttl = env.PRESIGN_PART_TTL) {
  return getSignedUrl(
    s3External,
    new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: ttl },
  );
}
```

- [ ] **Step 5: Run — expect PASS** (4 tests)

Run: `npm test -- test/s3.test.ts`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: s3 clients + presign helpers"
```

### Task 4: keys + http helpers

**Files:**
- Create: `src/lib/keys.ts`, `src/lib/http.ts`
- Test: `test/keys.test.ts`, `test/http.test.ts`

**Interfaces:**
- Produces: `src/lib/keys.ts` → `export function makeVideoKey(ext: string): string` → `promo-video/{YYYY}/{uuid}.{ext}` (ext는 소문자, 선행 `.` 허용/제거, 영숫자만 유지, 없으면 `bin`).
- Produces: `src/lib/http.ts` →
  - `export class HttpError extends Error { status: number; constructor(status: number, message: string) }`
  - `export function json(body: unknown, init?: number | ResponseInit): Response`
  - `export function handle(fn: () => Promise<Response>): Promise<Response>` (throw된 `HttpError` → `{error}` JSON + status; 그 외 → 500 + 로그)

- [ ] **Step 1: Write failing tests**

`test/keys.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeVideoKey } from "../src/lib/keys";

describe("makeVideoKey", () => {
  const yr = new Date().getFullYear();
  it("builds promo-video/<year>/<uuid>.<ext>", () => {
    const k = makeVideoKey("MP4");
    expect(k).toMatch(new RegExp(`^promo-video/${yr}/[0-9a-f-]{36}\\.mp4$`));
  });
  it("strips leading dot", () => {
    expect(makeVideoKey(".mov")).toMatch(/\.mov$/);
  });
  it("falls back to bin for empty/garbage ext", () => {
    expect(makeVideoKey("")).toMatch(/\.bin$/);
    expect(makeVideoKey("!!")).toMatch(/\.bin$/);
  });
});
```

`test/http.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { HttpError, json, handle } from "../src/lib/http";

describe("http", () => {
  it("json sets status from number init", async () => {
    const r = json({ ok: true }, 201);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
  });
  it("handle maps HttpError to status + {error}", async () => {
    const r = await handle(async () => { throw new HttpError(403, "nope"); });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "nope" });
  });
  it("handle maps unknown error to 500", async () => {
    const r = await handle(async () => { throw new Error("boom"); });
    expect(r.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- test/keys.test.ts test/http.test.ts`

- [ ] **Step 3: Implement**

`src/lib/keys.ts`:
```ts
import { randomUUID } from "node:crypto";

export function makeVideoKey(ext: string): string {
  const clean = ext.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safe = clean.length > 0 && clean.length <= 8 ? clean : "bin";
  return `promo-video/${new Date().getFullYear()}/${randomUUID()}.${safe}`;
}
```

`src/lib/http.ts`:
```ts
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, init?: number | ResponseInit): Response {
  const opts = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...opts,
    headers: { "content-type": "application/json", ...(opts as ResponseInit)?.headers },
  });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("unhandled route error", e);
    return json({ error: "internal error" }, 500);
  }
}
```

- [ ] **Step 4: Run — expect PASS** (6)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: key + http route helpers"
```

### Task 5: Auth.js Google provider + guards

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`, `src/lib/seed.ts`
- Test: `test/auth-guards.test.ts`, `test/seed.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `env` (Task 1), `HttpError` (Task 4).
- Produces: `src/lib/auth.ts` →
  - `export const { handlers, auth, signIn, signOut }` (NextAuth v5)
  - `export type SessionUser = { email: string; role: "member" | "admin"; name: string | null }`
  - `export async function requireUser(): Promise<SessionUser>` (없으면 `HttpError(401)`)
  - `export async function requireAdmin(): Promise<SessionUser>` (member면 `HttpError(403)`)
- Produces: `src/lib/seed.ts` → `export async function seedAdmin(): Promise<void>` (`env.SEED_ADMIN_EMAIL` 없으면 `role:"admin", status:"invited"` insert; 이미 있으면 no-op).
- Auth rules (`signIn` callback): `account.provider==="google"` 이고 profile의 `hd === env.GOOGLE_HD` 이고 `email_verified` 이고 `prisma.user` 에 email 존재 → 허용 + `status:"active"`, `name`, `googleSub` upsert. 아니면 거부.
- `session` callback: `session.user.role` = DB role, `session.user.email` 보장.

- [ ] **Step 1: Implement `src/lib/auth.ts`**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "./db";
import { env } from "./env";
import { HttpError } from "./http";

export type SessionUser = { email: string; role: "member" | "admin"; name: string | null };

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorization: { params: { hd: env.GOOGLE_HD, prompt: "select_account" } } })],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" || !profile) return false;
      const p = profile as { hd?: string; email?: string; email_verified?: boolean; sub?: string; name?: string };
      if (p.hd !== env.GOOGLE_HD || !p.email || p.email_verified !== true) return false;
      const existing = await prisma.user.findUnique({ where: { email: p.email } });
      if (!existing) return false;
      await prisma.user.update({
        where: { email: p.email },
        data: { status: "active", name: p.name ?? existing.name, googleSub: p.sub ?? existing.googleSub },
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      if (token.email) {
        const u = await prisma.user.findUnique({ where: { email: token.email as string } });
        token.role = u?.role ?? "member";
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        email: token.email as string,
        role: (token.role as "member" | "admin") ?? "member",
      };
      return session;
    },
  },
});

export async function requireUser(): Promise<SessionUser> {
  const s = await auth();
  if (!s?.user?.email) throw new HttpError(401, "login required");
  return { email: s.user.email, role: (s.user as { role?: "member" | "admin" }).role ?? "member", name: s.user.name ?? null };
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new HttpError(403, "admin only");
  return u;
}
```

- [ ] **Step 2: Route + middleware + seed**

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
export { GET, POST } from "@/lib/auth";
```
(`@/` alias: `tsconfig.json` `"paths": { "@/*": ["./src/*"] }` 추가.)

`src/middleware.ts`:
```ts
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const open = pathname.startsWith("/login") || pathname.startsWith("/api/auth")
    || pathname.startsWith("/s/") || pathname === "/api/healthz";
  if (open) return;
  if (!req.auth?.user) return Response.redirect(new URL("/login", req.url));
  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin"))
      && (req.auth.user as { role?: string }).role !== "admin") {
    return Response.redirect(new URL("/", req.url));
  }
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

`src/lib/seed.ts`:
```ts
import { prisma } from "./db";
import { env } from "./env";

export async function seedAdmin(): Promise<void> {
  await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL },
    update: {},
    create: { email: env.SEED_ADMIN_EMAIL, role: "admin", status: "invited" },
  });
}
```

- [ ] **Step 3: Write the failing test (guards + seed, no real OAuth)**

`test/seed.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("../src/lib/db", () => ({ prisma: db.prisma }));
  process.env.SEED_ADMIN_EMAIL = "admin@school.ac.kr";
});
afterAll(async () => { await db.stop(); });

describe("seedAdmin", () => {
  it("creates the seed admin once, idempotent", async () => {
    const { seedAdmin } = await import("../src/lib/seed");
    await seedAdmin();
    await seedAdmin();
    const rows = await db.prisma.user.findMany({ where: { email: "admin@school.ac.kr" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
  });
});
```

`test/auth-guards.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { HttpError } from "../src/lib/http";

function loadWithSession(session: unknown) {
  vi.resetModules();
  vi.doMock("next-auth", () => ({ default: () => ({ handlers: {}, auth: async () => session, signIn: vi.fn(), signOut: vi.fn() }) }));
  vi.doMock("next-auth/providers/google", () => ({ default: () => ({}) }));
  return import("../src/lib/auth");
}

describe("requireUser / requireAdmin", () => {
  it("401 when no session", async () => {
    const { requireUser } = await loadWithSession(null);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });
  it("403 for member on requireAdmin", async () => {
    const { requireAdmin } = await loadWithSession({ user: { email: "m@x", role: "member" } });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
  it("passes admin through", async () => {
    const { requireAdmin } = await loadWithSession({ user: { email: "a@x", role: "admin" } });
    await expect(requireAdmin()).resolves.toMatchObject({ email: "a@x", role: "admin" });
  });
});
```

- [ ] **Step 4: Run — iterate to PASS**

Run: `npm test -- test/seed.test.ts test/auth-guards.test.ts`
Expected: PASS (4). Fix mock wiring as needed; keep `src/lib/auth.ts` logic unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: google oauth (domain + allowlist) + route guards + admin seed"
```

### Task 6: audit log helper

**Files:**
- Create: `src/lib/audit.ts`
- Test: `test/audit.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2).
- Produces: `src/lib/audit.ts` → `export async function logAudit(actor: string | null, action: string, targetId?: string): Promise<void>` (실패해도 throw 안 함 — 감사로그가 주 동작을 막지 않음; 콘솔 경고만).

- [ ] **Step 1: Failing test**

`test/audit.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); });

describe("logAudit", () => {
  it("writes a row", async () => {
    const { logAudit } = await import("../src/lib/audit");
    await logAudit("a@school.ac.kr", "upload", "vid-1");
    const rows = await db.prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorEmail: "a@school.ac.kr", action: "upload", targetId: "vid-1" });
  });
  it("swallows db errors", async () => {
    const { logAudit } = await import("../src/lib/audit");
    const spy = vi.spyOn(db.prisma.auditLog, "create").mockRejectedValueOnce(new Error("x"));
    await expect(logAudit(null, "delete")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/lib/audit.ts`**

```ts
import { prisma } from "./db";

export async function logAudit(actor: string | null, action: string, targetId?: string): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { actorEmail: actor, action, targetId } });
  } catch (e) {
    console.warn("audit log failed", action, e);
  }
}
```

- [ ] **Step 4: Run — expect PASS** (2)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: audit log helper"
```

---

## Phase 2 — Admin allowlist

### Task 7: Admin users API

**Files:**
- Create: `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[email]/route.ts`
- Test: `test/api/admin-users.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 5), `prisma` (Task 2), `logAudit` (Task 6), `handle`/`json`/`HttpError` (Task 4).
- Produces (HTTP):
  - `GET /api/admin/users` → `200 { users: { email, role, status, name, createdAt }[] }` (email asc)
  - `POST /api/admin/users` body `{ email: string, role?: "member"|"admin" }` → `201 { user }`; 중복 → `409`; 잘못된 email → `400`. `audit action="user.invite"`.
  - `PATCH /api/admin/users/:email` body `{ role: "member"|"admin" }` → `200 { user }`; 없으면 `404`. `audit "role.change"`.
  - `DELETE /api/admin/users/:email` → `204`; 마지막 admin 삭제 시도 → `409 "cannot remove last admin"`. `audit "user.remove"`.

- [ ] **Step 1: `test/helpers/req.ts`** (route handler 호출 유틸 + 세션 mock)

```ts
import { vi } from "vitest";

export function mockSession(user: { email: string; role: "member" | "admin" } | null) {
  vi.doMock("../../src/lib/auth", async () => {
    const actual = await vi.importActual<typeof import("../../src/lib/auth")>("../../src/lib/auth");
    return {
      ...actual,
      requireUser: async () => {
        if (!user) throw new (await import("../../src/lib/http")).HttpError(401, "login required");
        return { ...user, name: null };
      },
      requireAdmin: async () => {
        const { HttpError } = await import("../../src/lib/http");
        if (!user) throw new HttpError(401, "login required");
        if (user.role !== "admin") throw new HttpError(403, "admin only");
        return { ...user, name: null };
      },
    };
  });
}

export function req(url: string, init?: RequestInit) {
  return new Request(`http://test${url}`, init);
}
export function jbody(o: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) };
}
```

- [ ] **Step 2: Write the failing test**

`test/api/admin-users.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { mockSession, req, jbody } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); });
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.auditLog.deleteMany();
  await db.prisma.user.deleteMany();
  await db.prisma.user.create({ data: { email: "admin@school.ac.kr", role: "admin", status: "active" } });
});

describe("admin users API", () => {
  it("member is 403 on GET", async () => {
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("../../src/app/api/admin/users/route");
    expect((await GET(req("/api/admin/users"))).status).toBe(403);
  });

  it("admin can invite, list, and it is audited", async () => {
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { POST, GET } = await import("../../src/app/api/admin/users/route");
    const c = await POST(req("/api/admin/users", jbody({ email: "new@school.ac.kr" })));
    expect(c.status).toBe(201);
    const list = await (await GET(req("/api/admin/users"))).json();
    expect(list.users.map((u: any) => u.email)).toContain("new@school.ac.kr");
    const audit = await db.prisma.auditLog.findMany({ where: { action: "user.invite" } });
    expect(audit).toHaveLength(1);
  });

  it("duplicate invite is 409", async () => {
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { POST } = await import("../../src/app/api/admin/users/route");
    await POST(req("/api/admin/users", jbody({ email: "dup@school.ac.kr" })));
    expect((await POST(req("/api/admin/users", jbody({ email: "dup@school.ac.kr" })))).status).toBe(409);
  });

  it("cannot remove the last admin", async () => {
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    const { DELETE } = await import("../../src/app/api/admin/users/[email]/route");
    const r = await DELETE(req("/api/admin/users/admin@school.ac.kr"), { params: Promise.resolve({ email: "admin@school.ac.kr" }) } as any);
    expect(r.status).toBe(409);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement `src/app/api/admin/users/route.ts`**

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    return json({ users });
  });
}

const inviteSchema = z.object({ email: z.string().email(), role: z.enum(["member", "admin"]).optional() });

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = inviteSchema.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "invalid body");
    const exists = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (exists) throw new HttpError(409, "already exists");
    const user = await prisma.user.create({
      data: { email: body.data.email, role: body.data.role ?? "member", status: "invited" },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    await logAudit(admin.email, "user.invite", user.email);
    return json({ user }, 201);
  });
}
```

`src/app/api/admin/users/[email]/route.ts`:
```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ email: string }> };
const roleSchema = z.object({ role: z.enum(["member", "admin"]) });

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { email } = await params;
    const body = roleSchema.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "invalid body");
    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) throw new HttpError(404, "not found");
    if (target.role === "admin" && body.data.role === "member") {
      const admins = await prisma.user.count({ where: { role: "admin" } });
      if (admins <= 1) throw new HttpError(409, "cannot demote last admin");
    }
    const user = await prisma.user.update({
      where: { email }, data: { role: body.data.role },
      select: { email: true, role: true, status: true, name: true, createdAt: true },
    });
    await logAudit(admin.email, "role.change", email);
    return json({ user });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { email } = await params;
    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) throw new HttpError(404, "not found");
    if (target.role === "admin") {
      const admins = await prisma.user.count({ where: { role: "admin" } });
      if (admins <= 1) throw new HttpError(409, "cannot remove last admin");
    }
    await prisma.user.delete({ where: { email } });
    await logAudit(admin.email, "user.remove", email);
    return new Response(null, { status: 204 });
  });
}
```

- [ ] **Step 5: Run — expect PASS** (4)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: admin allowlist API (invite/list/role/remove) + last-admin guard"
```

### Task 8: Admin allowlist page

**Files:**
- Create: `src/app/(app)/admin/page.tsx`, `src/app/(app)/admin/users-table.tsx`
- Test: `test/ui/users-table.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/:email` (Task 7).
- Produces: client component `<UsersTable initial={User[]} />` — 이메일 입력 + 추가 버튼(→ POST), 행별 role 토글(→ PATCH), 삭제 버튼(→ DELETE, confirm). 실패 시 인라인 에러 텍스트.
- `page.tsx` = server component: `requireAdmin()` 후 `prisma.user.findMany` → `<UsersTable initial={...} />`.

- [ ] **Step 1: Failing test (component, jsdom)**

`test/ui/users-table.test.tsx` — add `// @vitest-environment jsdom` at top.
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UsersTable } from "../../src/app/(app)/admin/users-table";

afterEach(() => vi.restoreAllMocks());

describe("UsersTable", () => {
  it("adds an email via POST and appends a row", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { email: "x@school.ac.kr", role: "member", status: "invited", name: null } }), { status: 201 }),
    );
    render(<UsersTable initial={[]} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "x@school.ac.kr" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    await waitFor(() => expect(screen.getByText("x@school.ac.kr")).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ method: "POST" }));
  });

  it("shows inline error on 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "already exists" }), { status: 409 }));
    render(<UsersTable initial={[]} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "dup@school.ac.kr" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeDefined());
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `users-table.tsx`** (`"use client"`)

```tsx
"use client";
import { useState } from "react";

type Row = { email: string; role: "member" | "admin"; status: string; name: string | null };

export function UsersTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data.error ?? "failed");
    setRows((r) => [...r, data.user]);
    setEmail("");
  }
  async function setRole(t: Row, role: "member" | "admin") {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(t.email)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }),
    });
    if (res.ok) setRows((r) => r.map((x) => (x.email === t.email ? { ...x, role } : x)));
    else setErr((await res.json()).error ?? "failed");
  }
  async function remove(t: Row) {
    if (!confirm(`Remove ${t.email}?`)) return;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(t.email)}`, { method: "DELETE" });
    if (res.status === 204) setRows((r) => r.filter((x) => x.email !== t.email));
    else setErr((await res.json()).error ?? "failed");
  }

  return (
    <div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="email">email</label>
        <input id="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="border px-2 py-1" placeholder="user@school.ac.kr" />
        <button onClick={add} className="border px-3 py-1">Add</button>
      </div>
      {err && <p className="text-red-600 text-sm mt-1">{err}</p>}
      <table className="mt-4 w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.email} className="border-t">
              <td className="py-1">{r.email}</td>
              <td>{r.status}</td>
              <td>
                <select value={r.role} onChange={(e) => setRole(r, e.target.value as "member" | "admin")}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td><button onClick={() => remove(r)} className="text-red-600">delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/app/(app)/admin/page.tsx`:
```tsx
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { UsersTable } from "./users-table";

export default async function AdminPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, role: true, status: true, name: true },
  });
  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold mb-4">접근 허용 계정</h1>
      <UsersTable initial={users} />
    </main>
  );
}
```

- [ ] **Step 4: Add `@testing-library/jest-dom`? No** — tests use plain `expect(...).toBeDefined()`. Run — expect PASS (2).

Run: `npm test -- test/ui/users-table.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: admin allowlist page"
```

---

## Phase 3 — Upload

### Task 9: upload lib (part math + ownership)

**Files:**
- Create: `src/lib/uploads.ts`
- Test: `test/uploads-lib.test.ts`

**Interfaces:**
- Consumes: `env` (Task 1), `prisma` (Task 2), `HttpError` (Task 4).
- Produces: `src/lib/uploads.ts` →
  - `export const PART_SIZE = 67108864`
  - `export const SINGLE_PUT_MAX = env.SINGLE_PUT_MAX_BYTES`
  - `export function needsMultipart(size: number): boolean` → `size > SINGLE_PUT_MAX`
  - `export function partCount(size: number): number` → `Math.max(1, Math.ceil(size / PART_SIZE))`
  - `export function extOf(filename: string): string` → 마지막 `.` 뒤 문자열, 없으면 `""`
  - `export async function assertUploadOwner(key: string, uploadId: string, email: string): Promise<{ videoId: string }>` — `upload` join `video` 조회, `video.s3Key===key && upload.s3UploadId===uploadId && video.uploadedBy===email` 아니면 `HttpError(403, "not your upload")`, 없으면 `HttpError(404)`.

- [ ] **Step 1: Failing test**

`test/uploads-lib.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => {
  db = await startTestDb();
  vi.doMock("../src/lib/db", () => ({ prisma: db.prisma }));
  process.env.SINGLE_PUT_MAX_BYTES = "94371840";
});
afterAll(async () => { await db.stop(); });

describe("uploads lib", () => {
  it("part math", async () => {
    const { PART_SIZE, needsMultipart, partCount } = await import("../src/lib/uploads");
    expect(needsMultipart(90 * 1024 * 1024)).toBe(false);
    expect(needsMultipart(90 * 1024 * 1024 + 1)).toBe(true);
    expect(partCount(0)).toBe(1);
    expect(partCount(PART_SIZE * 3 + 1)).toBe(4);
  });
  it("extOf", async () => {
    const { extOf } = await import("../src/lib/uploads");
    expect(extOf("a.b.MP4")).toBe("MP4");
    expect(extOf("noext")).toBe("");
  });
  it("assertUploadOwner rejects other users", async () => {
    const { assertUploadOwner } = await import("../src/lib/uploads");
    const v = await db.prisma.video.create({ data: { title: "t", s3Key: "k1", originalFilename: "x", uploadedBy: "owner@x", status: "uploading" } });
    await db.prisma.upload.create({ data: { videoId: v.id, s3UploadId: "up1", partSize: 1 } });
    await expect(assertUploadOwner("k1", "up1", "intruder@x")).rejects.toMatchObject({ status: 403 });
    await expect(assertUploadOwner("k1", "up1", "owner@x")).resolves.toMatchObject({ videoId: v.id });
    await expect(assertUploadOwner("nope", "up1", "owner@x")).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/lib/uploads.ts`**

```ts
import { env } from "./env";
import { prisma } from "./db";
import { HttpError } from "./http";

export const PART_SIZE = 67108864;
export const SINGLE_PUT_MAX = env.SINGLE_PUT_MAX_BYTES;

export const needsMultipart = (size: number) => size > SINGLE_PUT_MAX;
export const partCount = (size: number) => Math.max(1, Math.ceil(size / PART_SIZE));

export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 || i === filename.length - 1 ? "" : filename.slice(i + 1);
}

export async function assertUploadOwner(key: string, uploadId: string, email: string) {
  const up = await prisma.upload.findFirst({
    where: { s3UploadId: uploadId, video: { s3Key: key } },
    include: { video: true },
  });
  if (!up) throw new HttpError(404, "upload not found");
  if (up.video.uploadedBy !== email) throw new HttpError(403, "not your upload");
  return { videoId: up.videoId };
}
```

- [ ] **Step 4: Run — expect PASS** (3)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: upload lib (part math, ownership guard)"
```

### Task 10: single-PUT upload API

**Files:**
- Create: `src/app/api/uploads/route.ts`, `src/app/api/uploads/[videoId]/complete/route.ts`
- Test: `test/api/upload-single.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5), `signPutUrl` + `s3Internal` + `BUCKET` (Task 3), `makeVideoKey` (Task 4), `needsMultipart`/`extOf` (Task 9), `logAudit` (Task 6).
- Produces (HTTP):
  - `POST /api/uploads` body `{ title, description?, folderId?, originalFilename, contentType, size }` →
    - `size` multipart 필요 → `400 { error: "use multipart", multipart: true }`
    - else `videos` insert (`status:"pending"`, `uploadedBy`) → `201 { videoId, key, url }` (url = single presigned PUT)
  - `POST /api/uploads/:videoId/complete` → 소유자 확인 → `s3Internal.HeadObject` → `videos.update({ status:"ready", sizeBytes: ContentLength })` → `200 { video }`; 객체 없으면 `videos.status="failed"` + `409 { error: "object not found" }`. `audit "upload"`.

- [ ] **Step 1: Failing test** (MinIO + Postgres 둘 다)

`test/api/upload-single.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { mockSession, req, jbody } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;

beforeAll(async () => {
  db = await startTestDb();
  m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint, S3_ENDPOINT_INTERNAL: m.endpoint,
    S3_REGION: "us-east-1", S3_BUCKET: m.bucket,
    S3_ACCESS_KEY: m.accessKey, S3_SECRET_KEY: m.secretKey,
    SINGLE_PUT_MAX_BYTES: "94371840",
  });
  vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); await m.stop(); });
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.video.deleteMany();
  await db.prisma.auditLog.deleteMany();
  mockSession({ email: "owner@school.ac.kr", role: "member" });
});

describe("single-PUT upload", () => {
  it("rejects large files with multipart hint", async () => {
    const { POST } = await import("../../src/app/api/uploads/route");
    const r = await POST(req("/api/uploads", jbody({
      title: "big", originalFilename: "b.mp4", contentType: "video/mp4", size: 200 * 1024 * 1024,
    })));
    expect(r.status).toBe(400);
    expect((await r.json()).multipart).toBe(true);
  });

  it("happy path: create -> PUT -> complete sets ready + size", async () => {
    const { POST } = await import("../../src/app/api/uploads/route");
    const created = await (await POST(req("/api/uploads", jbody({
      title: "clip", originalFilename: "c.mp4", contentType: "video/mp4", size: 5,
    })))).json();
    const put = await fetch(created.url, { method: "PUT", body: "hello", headers: { "content-type": "video/mp4" } });
    expect(put.ok).toBe(true);

    const { POST: COMPLETE } = await import("../../src/app/api/uploads/[videoId]/complete/route");
    const done = await COMPLETE(req(`/api/uploads/${created.videoId}/complete`, { method: "POST" }),
      { params: Promise.resolve({ videoId: created.videoId }) } as any);
    expect(done.status).toBe(200);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: created.videoId } });
    expect(v.status).toBe("ready");
    expect(Number(v.sizeBytes)).toBe(5);
  });

  it("complete without object -> failed + 409", async () => {
    const { POST } = await import("../../src/app/api/uploads/route");
    const created = await (await POST(req("/api/uploads", jbody({
      title: "x", originalFilename: "x.mp4", contentType: "video/mp4", size: 5,
    })))).json();
    const { POST: COMPLETE } = await import("../../src/app/api/uploads/[videoId]/complete/route");
    const r = await COMPLETE(req(`/api/uploads/${created.videoId}/complete`, { method: "POST" }),
      { params: Promise.resolve({ videoId: created.videoId }) } as any);
    expect(r.status).toBe(409);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: created.videoId } });
    expect(v.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/app/api/uploads/route.ts`**

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { makeVideoKey } from "@/lib/keys";
import { needsMultipart, extOf } from "@/lib/uploads";
import { signPutUrl } from "@/lib/s3";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  folderId: z.string().uuid().optional(),
  originalFilename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.safeParse(await request.json());
    if (!body.success) throw new HttpError(400, "invalid body");
    const d = body.data;
    if (needsMultipart(d.size)) return json({ error: "use multipart", multipart: true }, 400);

    const key = makeVideoKey(extOf(d.originalFilename));
    const video = await prisma.video.create({
      data: {
        title: d.title, description: d.description, folderId: d.folderId ?? null,
        s3Key: key, contentType: d.contentType, originalFilename: d.originalFilename,
        status: "pending", uploadedBy: user.email,
      },
    });
    const url = await signPutUrl(key, d.contentType);
    return json({ videoId: video.id, key, url }, 201);
  });
}
```

`src/app/api/uploads/[videoId]/complete/route.ts`:
```ts
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ videoId: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { videoId } = await params;
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new HttpError(404, "video not found");
    if (video.uploadedBy !== user.email) throw new HttpError(403, "not your upload");

    try {
      const head = await s3Internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: video.s3Key }));
      const updated = await prisma.video.update({
        where: { id: videoId },
        data: { status: "ready", sizeBytes: BigInt(head.ContentLength ?? 0) },
      });
      await logAudit(user.email, "upload", videoId);
      return json({ video: { ...updated, sizeBytes: Number(updated.sizeBytes) } });
    } catch {
      await prisma.video.update({ where: { id: videoId }, data: { status: "failed" } });
      throw new HttpError(409, "object not found");
    }
  });
}
```

- [ ] **Step 4: Run — expect PASS** (3)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: single-PUT upload API (create + complete)"
```

### Task 11: multipart upload API

**Files:**
- Create: `src/app/api/uploads/create/route.ts`, `src/app/api/uploads/sign-part/route.ts`, `src/app/api/uploads/list-parts/route.ts`, `src/app/api/uploads/complete/route.ts`, `src/app/api/uploads/abort/route.ts`
- Test: `test/api/upload-multipart.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `assertUploadOwner`/`PART_SIZE`/`extOf` (Task 9), `makeVideoKey` (Task 4), `s3External`/`s3Internal`/`BUCKET`/`signUploadPartUrl` (Task 3), `logAudit`.
- Produces (HTTP, 전부 로그인 필수):
  - `POST /api/uploads/create` body `{ title, description?, folderId?, originalFilename, contentType, size }` → `s3Internal.CreateMultipartUpload` → `videos` insert(`status:"uploading"`) + `uploads` insert → `201 { videoId, key, uploadId, partSize: PART_SIZE }`
  - `POST /api/uploads/sign-part` body `{ key, uploadId, partNumber }` → `assertUploadOwner` → `201 { url }` (`signUploadPartUrl`)
  - `GET /api/uploads/list-parts?key=&uploadId=` → `assertUploadOwner` → `s3Internal.ListParts` → `200 { parts: { partNumber, etag, size }[] }`
  - `POST /api/uploads/complete` body `{ key, uploadId, parts: { partNumber, etag }[] }` → `assertUploadOwner` → `s3Internal.CompleteMultipartUpload` → `s3Internal.HeadObject` → `videos.update({status:"ready", sizeBytes})` + `uploads.delete` → `200 { video }`. `audit "upload"`.
  - `POST /api/uploads/abort` body `{ key, uploadId }` → `assertUploadOwner` → `s3Internal.AbortMultipartUpload` → `videos.update({status:"failed"})` + `uploads.delete` → `200 { ok: true }`

- [ ] **Step 1: Failing test**

`test/api/upload-multipart.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { mockSession, req, jbody } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;

beforeAll(async () => {
  db = await startTestDb();
  m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint, S3_ENDPOINT_INTERNAL: m.endpoint,
    S3_REGION: "us-east-1", S3_BUCKET: m.bucket,
    S3_ACCESS_KEY: m.accessKey, S3_SECRET_KEY: m.secretKey,
    SINGLE_PUT_MAX_BYTES: "1",
  });
  vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); await m.stop(); });
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.upload.deleteMany();
  await db.prisma.video.deleteMany();
  await db.prisma.auditLog.deleteMany();
});

async function createUpload(email = "owner@school.ac.kr") {
  mockSession({ email, role: "member" });
  const { POST } = await import("../../src/app/api/uploads/create/route");
  return (await POST(req("/api/uploads/create", jbody({
    title: "big", originalFilename: "b.mp4", contentType: "video/mp4", size: 10,
  })))).json();
}

describe("multipart upload", () => {
  it("full flow: create -> sign-part -> PUT part -> complete -> ready", async () => {
    const c = await createUpload();
    const { POST: SIGN } = await import("../../src/app/api/uploads/sign-part/route");
    const { url } = await (await SIGN(req("/api/uploads/sign-part", jbody({ key: c.key, uploadId: c.uploadId, partNumber: 1 })))).json();
    const put = await fetch(url, { method: "PUT", body: "abcdefghij" });
    const etag = put.headers.get("etag")!;
    expect(etag).toBeTruthy();

    const { POST: COMPLETE } = await import("../../src/app/api/uploads/complete/route");
    const done = await COMPLETE(req("/api/uploads/complete", jbody({
      key: c.key, uploadId: c.uploadId, parts: [{ partNumber: 1, etag }],
    })));
    expect(done.status).toBe(200);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: c.videoId } });
    expect(v.status).toBe("ready");
    expect(Number(v.sizeBytes)).toBe(10);
    expect(await db.prisma.upload.findUnique({ where: { videoId: c.videoId } })).toBeNull();
  });

  it("sign-part rejects a different user (403)", async () => {
    const c = await createUpload("owner@school.ac.kr");
    mockSession({ email: "intruder@school.ac.kr", role: "member" });
    vi.resetModules();
    const { POST: SIGN } = await import("../../src/app/api/uploads/sign-part/route");
    const r = await SIGN(req("/api/uploads/sign-part", jbody({ key: c.key, uploadId: c.uploadId, partNumber: 1 })));
    expect(r.status).toBe(403);
  });

  it("list-parts reports uploaded parts for resume", async () => {
    const c = await createUpload();
    const { POST: SIGN } = await import("../../src/app/api/uploads/sign-part/route");
    const { url } = await (await SIGN(req("/api/uploads/sign-part", jbody({ key: c.key, uploadId: c.uploadId, partNumber: 1 })))).json();
    await fetch(url, { method: "PUT", body: "abcdefghij" });
    const { GET: LIST } = await import("../../src/app/api/uploads/list-parts/route");
    const parts = await (await LIST(req(`/api/uploads/list-parts?key=${encodeURIComponent(c.key)}&uploadId=${encodeURIComponent(c.uploadId)}`))).json();
    expect(parts.parts).toHaveLength(1);
    expect(parts.parts[0].partNumber).toBe(1);
  });

  it("abort marks failed and clears upload row", async () => {
    const c = await createUpload();
    const { POST: ABORT } = await import("../../src/app/api/uploads/abort/route");
    const r = await ABORT(req("/api/uploads/abort", jbody({ key: c.key, uploadId: c.uploadId })));
    expect(r.status).toBe(200);
    const v = await db.prisma.video.findUniqueOrThrow({ where: { id: c.videoId } });
    expect(v.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the five routes**

`src/app/api/uploads/create/route.ts`:
```ts
import { z } from "zod";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { makeVideoKey } from "@/lib/keys";
import { extOf, PART_SIZE } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";

const schema = z.object({
  title: z.string().min(1), description: z.string().optional(),
  folderId: z.string().uuid().optional(),
  originalFilename: z.string().min(1), contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const d = b.data;
    const key = makeVideoKey(extOf(d.originalFilename));
    const mpu = await s3Internal.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: d.contentType }));
    if (!mpu.UploadId) throw new HttpError(502, "no upload id from S3");
    const video = await prisma.video.create({
      data: {
        title: d.title, description: d.description, folderId: d.folderId ?? null,
        s3Key: key, contentType: d.contentType, originalFilename: d.originalFilename,
        status: "uploading", uploadedBy: user.email,
        upload: { create: { s3UploadId: mpu.UploadId, partSize: PART_SIZE } },
      },
    });
    return json({ videoId: video.id, key, uploadId: mpu.UploadId, partSize: PART_SIZE }, 201);
  });
}
```

`src/app/api/uploads/sign-part/route.ts`:
```ts
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { signUploadPartUrl } from "@/lib/s3";

const schema = z.object({ key: z.string(), uploadId: z.string(), partNumber: z.number().int().positive() });

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    await assertUploadOwner(b.data.key, b.data.uploadId, user.email);
    const url = await signUploadPartUrl(b.data.key, b.data.uploadId, b.data.partNumber);
    return json({ url }, 201);
  });
}
```

`src/app/api/uploads/list-parts/route.ts`:
```ts
import { ListPartsCommand } from "@aws-sdk/client-s3";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const uploadId = url.searchParams.get("uploadId");
    if (!key || !uploadId) throw new HttpError(400, "key and uploadId required");
    await assertUploadOwner(key, uploadId, user.email);
    const out = await s3Internal.send(new ListPartsCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
    const parts = (out.Parts ?? []).map((p) => ({ partNumber: p.PartNumber, etag: p.ETag, size: p.Size }));
    return json({ parts });
  });
}
```

`src/app/api/uploads/complete/route.ts`:
```ts
import { z } from "zod";
import { CompleteMultipartUploadCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  key: z.string(), uploadId: z.string(),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string() })).min(1),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const { videoId } = await assertUploadOwner(b.data.key, b.data.uploadId, user.email);
    await s3Internal.send(new CompleteMultipartUploadCommand({
      Bucket: BUCKET, Key: b.data.key, UploadId: b.data.uploadId,
      MultipartUpload: {
        Parts: b.data.parts
          .sort((x, y) => x.partNumber - y.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }));
    const head = await s3Internal.send(new HeadObjectCommand({ Bucket: BUCKET, Key: b.data.key }));
    const [updated] = await prisma.$transaction([
      prisma.video.update({ where: { id: videoId }, data: { status: "ready", sizeBytes: BigInt(head.ContentLength ?? 0) } }),
      prisma.upload.delete({ where: { videoId } }),
    ]);
    await logAudit(user.email, "upload", videoId);
    return json({ video: { ...updated, sizeBytes: Number(updated.sizeBytes) } });
  });
}
```

`src/app/api/uploads/abort/route.ts`:
```ts
import { z } from "zod";
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { assertUploadOwner } from "@/lib/uploads";
import { s3Internal, BUCKET } from "@/lib/s3";

const schema = z.object({ key: z.string(), uploadId: z.string() });

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    const { videoId } = await assertUploadOwner(b.data.key, b.data.uploadId, user.email);
    await s3Internal.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: b.data.key, UploadId: b.data.uploadId }));
    await prisma.$transaction([
      prisma.video.update({ where: { id: videoId }, data: { status: "failed" } }),
      prisma.upload.delete({ where: { videoId } }),
    ]);
    return json({ ok: true });
  });
}
```

- [ ] **Step 4: Run — expect PASS** (4)

Run: `npm test -- test/api/upload-multipart.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: multipart upload API (create/sign-part/list-parts/complete/abort)"
```

---

## Phase 4 — Browse: folders + video list

### Task 12: folders API

**Files:**
- Create: `src/app/api/folders/route.ts`
- Test: `test/api/folders.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `handle`/`json`/`HttpError`, `logAudit`.
- Produces (HTTP):
  - `GET /api/folders` → `200 { folders: { id, name, parentId }[] }` (name asc) — 클라이언트가 트리 조립.
  - `POST /api/folders` body `{ name: string, parentId?: string }` → `parentId` 주어졌는데 없으면 `400` → `201 { folder }`. `audit "folder.create"`.

- [ ] **Step 1: Failing test**

`test/api/folders.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { mockSession, req, jbody } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => { db = await startTestDb(); vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma })); });
afterAll(async () => { await db.stop(); });
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.folder.deleteMany();
  mockSession({ email: "m@school.ac.kr", role: "member" });
});

describe("folders API", () => {
  it("creates nested folder and lists", async () => {
    const { POST, GET } = await import("../../src/app/api/folders/route");
    const root = await (await POST(req("/api/folders", jbody({ name: "2026" })))).json();
    const child = await POST(req("/api/folders", jbody({ name: "행사", parentId: root.folder.id })));
    expect(child.status).toBe(201);
    const list = await (await GET(req("/api/folders"))).json();
    expect(list.folders).toHaveLength(2);
  });
  it("rejects unknown parent", async () => {
    const { POST } = await import("../../src/app/api/folders/route");
    const r = await POST(req("/api/folders", jbody({ name: "x", parentId: "00000000-0000-0000-0000-000000000000" })));
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/app/api/folders/route.ts`**

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const folders = await prisma.folder.findMany({
      orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true },
    });
    return json({ folders });
  });
}

const schema = z.object({ name: z.string().min(1).max(120), parentId: z.string().uuid().optional() });

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const b = schema.safeParse(await request.json());
    if (!b.success) throw new HttpError(400, "invalid body");
    if (b.data.parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: b.data.parentId } });
      if (!parent) throw new HttpError(400, "parent not found");
    }
    const folder = await prisma.folder.create({
      data: { name: b.data.name, parentId: b.data.parentId ?? null, createdBy: user.email },
      select: { id: true, name: true, parentId: true },
    });
    await logAudit(user.email, "folder.create", folder.id);
    return json({ folder }, 201);
  });
}
```

- [ ] **Step 4: Run — expect PASS** (2)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: folders API"
```

### Task 13: video list + search + delete API

**Files:**
- Create: `src/app/api/videos/route.ts`, `src/app/api/videos/[id]/route.ts`
- Test: `test/api/videos-list.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `s3Internal`/`BUCKET`, `logAudit`, `handle`/`json`/`HttpError`.
- Produces (HTTP):
  - `GET /api/videos?folderId=&q=&cursor=` → `status="ready"` 만. `folderId` 없으면 루트(`folderId: null`), `"all"` 이면 전체. `q` → `title` `contains`(insensitive). `createdAt desc`, `take: 50`, cursor 페이지네이션. → `200 { videos: { id, title, sizeBytes, contentType, originalFilename, createdAt, folderId }[], nextCursor: string | null }`
  - `DELETE /api/videos/:id` → 업로더 본인 또는 admin만 (`HttpError(403)`), else `s3Internal.DeleteObject` + `prisma.video.delete` (share_links cascade) → `204`. `audit "delete"`.

- [ ] **Step 1: Failing test**

`test/api/videos-list.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { mockSession, req } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;
beforeAll(async () => {
  db = await startTestDb(); m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint, S3_ENDPOINT_INTERNAL: m.endpoint, S3_REGION: "us-east-1",
    S3_BUCKET: m.bucket, S3_ACCESS_KEY: m.accessKey, S3_SECRET_KEY: m.secretKey,
  });
  vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); await m.stop(); });
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.video.deleteMany();
  await db.prisma.auditLog.deleteMany();
});

async function seedVideos() {
  await db.prisma.video.createMany({ data: [
    { title: "체육대회 하이라이트", s3Key: "k1", originalFilename: "a.mp4", status: "ready" },
    { title: "축제 오프닝", s3Key: "k2", originalFilename: "b.mp4", status: "ready" },
    { title: "업로드중", s3Key: "k3", originalFilename: "c.mp4", status: "uploading" },
  ] });
}

describe("videos list API", () => {
  it("returns only ready videos at root", async () => {
    await seedVideos();
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("../../src/app/api/videos/route");
    const data = await (await GET(req("/api/videos"))).json();
    expect(data.videos).toHaveLength(2);
  });
  it("filters by q (case-insensitive)", async () => {
    await seedVideos();
    mockSession({ email: "m@school.ac.kr", role: "member" });
    const { GET } = await import("../../src/app/api/videos/route");
    const data = await (await GET(req("/api/videos?q=축제"))).json();
    expect(data.videos.map((v: any) => v.title)).toEqual(["축제 오프닝"]);
  });
  it("member cannot delete another user's video (403); admin can (204)", async () => {
    const v = await db.prisma.video.create({ data: { title: "x", s3Key: "kd", originalFilename: "d.mp4", status: "ready", uploadedBy: "owner@school.ac.kr" } });
    mockSession({ email: "intruder@school.ac.kr", role: "member" });
    let { DELETE } = await import("../../src/app/api/videos/[id]/route");
    expect((await DELETE(req(`/api/videos/${v.id}`), { params: Promise.resolve({ id: v.id }) } as any)).status).toBe(403);
    vi.resetModules();
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    ({ DELETE } = await import("../../src/app/api/videos/[id]/route"));
    expect((await DELETE(req(`/api/videos/${v.id}`), { params: Promise.resolve({ id: v.id }) } as any)).status).toBe(204);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`src/app/api/videos/route.ts`:
```ts
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export async function GET(request: Request) {
  return handle(async () => {
    await requireUser();
    const p = new URL(request.url).searchParams;
    const folderParam = p.get("folderId");
    const q = p.get("q")?.trim();
    const cursor = p.get("cursor");

    const where: Record<string, unknown> = { status: "ready" };
    if (folderParam !== "all") where.folderId = folderParam ?? null;
    if (q) where.title = { contains: q, mode: "insensitive" };

    const rows = await prisma.video.findMany({
      where, orderBy: { createdAt: "desc" }, take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, title: true, sizeBytes: true, contentType: true, originalFilename: true, createdAt: true, folderId: true },
    });
    const nextCursor = rows.length > 50 ? rows[49].id : null;
    const videos = rows.slice(0, 50).map((v) => ({ ...v, sizeBytes: v.sizeBytes == null ? null : Number(v.sizeBytes) }));
    return json({ videos, nextCursor });
  });
}
```

`src/app/api/videos/[id]/route.ts`:
```ts
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { s3Internal, BUCKET } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) throw new HttpError(404, "not found");
    if (user.role !== "admin" && video.uploadedBy !== user.email) throw new HttpError(403, "forbidden");
    await s3Internal.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: video.s3Key })).catch(() => {});
    await prisma.video.delete({ where: { id } });
    await logAudit(user.email, "delete", id);
    return new Response(null, { status: 204 });
  });
}
```

- [ ] **Step 4: Run — expect PASS** (3)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: video list/search + delete API"
```

---

## Phase 5 — Playback, download, share

### Task 14: video URL (play / download) API

**Files:**
- Create: `src/app/api/videos/[id]/url/route.ts`
- Test: `test/api/video-url.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `signGetUrl` (Task 3).
- Produces (HTTP): `GET /api/videos/:id/url?disposition=inline|attachment` → `status!=="ready"` → `409` → `200 { url }`.
  - `attachment` → `signGetUrl(key, { disposition:"attachment", filename: originalFilename })`
  - `inline`(기본) → `signGetUrl(key, { disposition:"inline" })`

- [ ] **Step 1: Failing test**

`test/api/video-url.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { mockSession, req } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;
beforeAll(async () => {
  db = await startTestDb(); m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint, S3_ENDPOINT_INTERNAL: m.endpoint, S3_REGION: "us-east-1",
    S3_BUCKET: m.bucket, S3_ACCESS_KEY: m.accessKey, S3_SECRET_KEY: m.secretKey,
  });
  vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); await m.stop(); });
beforeEach(async () => { vi.resetModules(); await db.prisma.video.deleteMany(); mockSession({ email: "m@school.ac.kr", role: "member" }); });

describe("video url API", () => {
  it("409 when not ready", async () => {
    const v = await db.prisma.video.create({ data: { title: "t", s3Key: "k", originalFilename: "a.mp4", status: "uploading" } });
    const { GET } = await import("../../src/app/api/videos/[id]/url/route");
    expect((await GET(req(`/api/videos/${v.id}/url`), { params: Promise.resolve({ id: v.id }) } as any)).status).toBe(409);
  });
  it("attachment disposition includes filename", async () => {
    const v = await db.prisma.video.create({ data: { title: "t", s3Key: "k", originalFilename: "내 영상.mp4", status: "ready" } });
    const { GET } = await import("../../src/app/api/videos/[id]/url/route");
    const { url } = await (await GET(req(`/api/videos/${v.id}/url?disposition=attachment`), { params: Promise.resolve({ id: v.id }) } as any)).json();
    expect(decodeURIComponent(url)).toContain('attachment; filename="내 영상.mp4"');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/app/api/videos/[id]/url/route.ts`**

```ts
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, json, HttpError } from "@/lib/http";
import { signGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    await requireUser();
    const { id } = await params;
    const disposition = new URL(request.url).searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) throw new HttpError(404, "not found");
    if (video.status !== "ready") throw new HttpError(409, "not ready");
    const url = await signGetUrl(video.s3Key, {
      disposition,
      filename: disposition === "attachment" ? video.originalFilename : undefined,
    });
    return json({ url });
  });
}
```

- [ ] **Step 4: Run — expect PASS** (2)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: video play/download presigned URL API"
```

### Task 15: share links API + public resolver

**Files:**
- Create: `src/app/api/videos/[id]/share/route.ts`, `src/app/api/share/[id]/route.ts`, `src/app/s/[token]/url/route.ts`
- Test: `test/api/share.test.ts`

**Interfaces:**
- Consumes: `requireUser` (share 생성/삭제), `prisma`, `signGetUrl`, `env.NEXTAUTH_URL`, `nanoid`, `logAudit`.
- Produces (HTTP):
  - `POST /api/videos/:id/share` body `{ expiresAt?: string (ISO) }` → video `ready` 아니면 `409` → `token = nanoid(22)` → `201 { token, url: "${NEXTAUTH_URL}/s/${token}" }`. `audit "share.create"`.
  - `DELETE /api/share/:id` → 생성자 본인 또는 admin (`403` else) → `revokedAt = now()` → `204`. `audit "share.revoke"`.
  - `GET /s/:token/url` (**로그인 불필요**) → 토큰 조회. 없음/`revokedAt`/`expiresAt < now` → `404`. video `ready` 아니면 `404`. → `302` redirect to `signGetUrl(key, { disposition:"inline" })`.

- [ ] **Step 1: Failing test**

`test/api/share.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { mockSession, req, jbody } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;
beforeAll(async () => {
  db = await startTestDb(); m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint, S3_ENDPOINT_INTERNAL: m.endpoint, S3_REGION: "us-east-1",
    S3_BUCKET: m.bucket, S3_ACCESS_KEY: m.accessKey, S3_SECRET_KEY: m.secretKey,
    NEXTAUTH_URL: "https://promo.madp.cloud",
  });
  vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); await m.stop(); });
beforeEach(async () => {
  vi.resetModules();
  await db.prisma.shareLink.deleteMany();
  await db.prisma.video.deleteMany();
});

async function readyVideo() {
  return db.prisma.video.create({ data: { title: "t", s3Key: "k", originalFilename: "a.mp4", status: "ready", uploadedBy: "owner@school.ac.kr" } });
}

describe("share links", () => {
  it("create returns absolute url, resolver 302s to presigned", async () => {
    const v = await readyVideo();
    mockSession({ email: "owner@school.ac.kr", role: "member" });
    const { POST } = await import("../../src/app/api/videos/[id]/share/route");
    const s = await (await POST(req(`/api/videos/${v.id}/share`, jbody({})), { params: Promise.resolve({ id: v.id }) } as any)).json();
    expect(s.url).toBe(`https://promo.madp.cloud/s/${s.token}`);

    vi.resetModules();
    const { GET } = await import("../../src/app/s/[token]/url/route");
    const r = await GET(req(`/s/${s.token}/url`), { params: Promise.resolve({ token: s.token }) } as any);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain(m.endpoint);
  });

  it("revoked token -> 404", async () => {
    const v = await readyVideo();
    const link = await db.prisma.shareLink.create({ data: { token: "revoked1revoked1revok12", videoId: v.id, revokedAt: new Date() } });
    const { GET } = await import("../../src/app/s/[token]/url/route");
    const r = await GET(req(`/s/${link.token}/url`), { params: Promise.resolve({ token: link.token }) } as any);
    expect(r.status).toBe(404);
  });

  it("expired token -> 404", async () => {
    const v = await readyVideo();
    const link = await db.prisma.shareLink.create({ data: { token: "expired1expired1expir12", videoId: v.id, expiresAt: new Date(Date.now() - 1000) } });
    const { GET } = await import("../../src/app/s/[token]/url/route");
    expect((await GET(req(`/s/${link.token}/url`), { params: Promise.resolve({ token: link.token }) } as any)).status).toBe(404);
  });

  it("non-owner member cannot revoke (403); admin can (204)", async () => {
    const v = await readyVideo();
    const link = await db.prisma.shareLink.create({ data: { token: "tok1tok1tok1tok1tok1t12", videoId: v.id, createdBy: "owner@school.ac.kr" } });
    mockSession({ email: "intruder@school.ac.kr", role: "member" });
    let { DELETE } = await import("../../src/app/api/share/[id]/route");
    expect((await DELETE(req(`/api/share/${link.id}`), { params: Promise.resolve({ id: link.id }) } as any)).status).toBe(403);
    vi.resetModules();
    mockSession({ email: "admin@school.ac.kr", role: "admin" });
    ({ DELETE } = await import("../../src/app/api/share/[id]/route"));
    expect((await DELETE(req(`/api/share/${link.id}`), { params: Promise.resolve({ id: link.id }) } as any)).status).toBe(204);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`src/app/api/videos/[id]/share/route.ts`:
```ts
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { handle, json, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ expiresAt: z.string().datetime().optional() });

export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const b = schema.safeParse(await request.json().catch(() => ({})));
    if (!b.success) throw new HttpError(400, "invalid body");
    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) throw new HttpError(404, "not found");
    if (video.status !== "ready") throw new HttpError(409, "not ready");
    const token = nanoid(22);
    await prisma.shareLink.create({
      data: { token, videoId: id, createdBy: user.email, expiresAt: b.data.expiresAt ? new Date(b.data.expiresAt) : null },
    });
    await logAudit(user.email, "share.create", id);
    return json({ token, url: `${env.NEXTAUTH_URL}/s/${token}` }, 201);
  });
}
```

`src/app/api/share/[id]/route.ts`:
```ts
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/http";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const link = await prisma.shareLink.findUnique({ where: { id } });
    if (!link) throw new HttpError(404, "not found");
    if (user.role !== "admin" && link.createdBy !== user.email) throw new HttpError(403, "forbidden");
    await prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAudit(user.email, "share.revoke", link.videoId);
    return new Response(null, { status: 204 });
  });
}
```

`src/app/s/[token]/url/route.ts`:
```ts
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { signGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const { token } = await params;
    const link = await prisma.shareLink.findUnique({ where: { token }, include: { video: true } });
    const dead = !link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date()) || link.video.status !== "ready";
    if (dead) return new Response("Not found", { status: 404 });
    const url = await signGetUrl(link!.video.s3Key, { disposition: "inline" });
    return new Response(null, { status: 302, headers: { location: url } });
  });
}
```

- [ ] **Step 4: Run — expect PASS** (4)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: share links API + public resolver"
```

---

## Phase 6 — Frontend

### Task 16: app shell + login + root providers

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/login/page.tsx`, `src/app/(app)/layout.tsx`, `src/components/nav.tsx`, `src/app/global-error.tsx`
- Test: `test/ui/nav.test.tsx`

**Interfaces:**
- Consumes: `auth`, `signIn`, `signOut` (Task 5).
- Produces: `<Nav user={{ email, role }} />` — 링크: `/`(영상), `/upload`(업로드), `role==="admin"` 이면 `/admin`(계정관리), 로그아웃 버튼.
- `src/app/(app)/layout.tsx` = server component: `const s = await auth()` → 없으면 `redirect("/login")` → `<Nav>` + `{children}`.
- `src/app/login/page.tsx`: 이미 로그인 시 `redirect("/")`. "학교 Google 계정으로 로그인" 버튼 → server action `signIn("google", { redirectTo: "/" })`. `?error=` 있으면 "접근 권한이 없습니다. 관리자에게 문의하세요." 표시.

- [ ] **Step 1: Failing test**

`test/ui/nav.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "../../src/components/nav";

describe("Nav", () => {
  it("hides admin link for members", () => {
    render(<Nav user={{ email: "m@school.ac.kr", role: "member" }} />);
    expect(screen.queryByRole("link", { name: /계정관리/ })).toBeNull();
  });
  it("shows admin link for admins", () => {
    render(<Nav user={{ email: "a@school.ac.kr", role: "admin" }} />);
    expect(screen.getByRole("link", { name: /계정관리/ })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`src/components/nav.tsx`:
```tsx
import Link from "next/link";
import { signOut } from "@/lib/auth";

export function Nav({ user }: { user: { email: string; role: "member" | "admin" } }) {
  return (
    <header className="flex items-center gap-4 border-b px-6 py-3 text-sm">
      <Link href="/" className="font-semibold">홍보부 영상</Link>
      <Link href="/upload">업로드</Link>
      {user.role === "admin" && <Link href="/admin">계정관리</Link>}
      <span className="ml-auto text-gray-500">{user.email}</span>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
        <button className="underline">로그아웃</button>
      </form>
    </header>
  );
}
```

`src/app/(app)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await auth();
  if (!s?.user?.email) redirect("/login");
  const user = { email: s.user.email, role: (s.user as { role?: "member" | "admin" }).role ?? "member" };
  return <div><Nav user={user} />{children}</div>;
}
```

`src/app/login/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await auth();
  if (s?.user?.email) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold mb-4">홍보부 영상 클라우드</h1>
        {error && <p className="text-red-600 mb-3 text-sm">접근 권한이 없습니다. 관리자에게 문의하세요.</p>}
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
          <button className="border px-4 py-2">학교 Google 계정으로 로그인</button>
        </form>
      </div>
    </main>
  );
}
```

`src/app/global-error.tsx`: minimal fallback rendering `<h2>문제가 발생했습니다</h2>` + reset button.

- [ ] **Step 4: Run — expect PASS** (2)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: app shell, nav, login page"
```

### Task 17: Uppy uploader page

**Files:**
- Create: `src/app/(app)/upload/page.tsx`, `src/components/uploader.tsx`
- Test: `test/ui/uploader.test.tsx`

**Interfaces:**
- Consumes: `POST /api/uploads` (single), `POST /api/uploads/create`, `POST /api/uploads/sign-part`, `GET /api/uploads/list-parts`, `POST /api/uploads/complete`, `POST /api/uploads/abort`, `POST /api/uploads/:videoId/complete` (single), `GET /api/folders`, `POST /api/folders`.
- Produces: `<Uploader folders={Folder[]} />` client component.
  - `@uppy/aws-s3` plugin config:
    - `shouldUseMultipart: (file) => file.size > SINGLE_PUT_MAX` — `SINGLE_PUT_MAX`는 `NEXT_PUBLIC_SINGLE_PUT_MAX_BYTES` env로 클라이언트에 노출 (기본 94371840).
    - `getUploadParameters(file)` → `POST /api/uploads` → `{ method:"PUT", url, headers:{ "content-type": file.type } }`; 성공 시 `file.meta.videoId` 저장. 업로드 완료 이벤트에서 `POST /api/uploads/:videoId/complete`.
    - `createMultipartUpload(file)` → `POST /api/uploads/create` → `{ uploadId, key }`; `file.meta` 에 저장.
    - `signPart(file, { uploadId, key, partNumber })` → `POST /api/uploads/sign-part` → `{ url }`.
    - `listParts(file, { uploadId, key })` → `GET /api/uploads/list-parts` → `[{ PartNumber, ETag, Size }]` (서버 응답 `{partNumber,etag,size}` → 대문자 키로 매핑).
    - `completeMultipartUpload(file, { uploadId, key, parts })` → `POST /api/uploads/complete` (parts → `{partNumber, etag}`).
    - `abortMultipartUpload(file, { uploadId, key })` → `POST /api/uploads/abort`.
  - 상단: 폴더 선택 `<select>` + "새 폴더" 입력. 선택된 `folderId`를 create 요청 `meta`로 전달.
  - `@uppy/dashboard` UI, `restrictions: { allowedFileTypes: ["video/*"] }`. 안내문: "H.264 MP4 권장. 교내 유선 연결에서 업로드하세요."

- [ ] **Step 1: Failing test** (플러그인 콜백만 유닛 테스트 — Uppy 인스턴스 없이 순수 함수로 분리)

Refactor: `src/components/upload-adapter.ts` 에 순수 함수로 콜백 구현, `<Uploader>` 는 이를 wiring만.

`src/components/upload-adapter.ts` interface:
```ts
export const SINGLE_PUT_MAX = Number(process.env.NEXT_PUBLIC_SINGLE_PUT_MAX_BYTES ?? 94371840);
export function makeAdapter(getFolderId: () => string | undefined): {
  shouldUseMultipart: (f: { size: number }) => boolean;
  getUploadParameters: (f: File & { meta: Record<string, unknown> }) => Promise<{ method: "PUT"; url: string; headers: Record<string, string> }>;
  createMultipartUpload: (f: File & { meta: Record<string, unknown> }) => Promise<{ uploadId: string; key: string }>;
  signPart: (f: unknown, o: { uploadId: string; key: string; partNumber: number }) => Promise<{ url: string }>;
  listParts: (f: unknown, o: { uploadId: string; key: string }) => Promise<{ PartNumber: number; ETag: string; Size: number }[]>;
  completeMultipartUpload: (f: unknown, o: { uploadId: string; key: string; parts: { PartNumber: number; ETag: string }[] }) => Promise<{ location?: string }>;
  abortMultipartUpload: (f: unknown, o: { uploadId: string; key: string }) => Promise<void>;
  finalizeSingle: (videoId: string) => Promise<void>;
};
```

`test/ui/uploader.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { makeAdapter } from "../../src/components/upload-adapter";

afterEach(() => vi.restoreAllMocks());

describe("upload adapter", () => {
  it("shouldUseMultipart uses the client threshold", () => {
    const a = makeAdapter(() => undefined);
    expect(a.shouldUseMultipart({ size: 94371840 })).toBe(false);
    expect(a.shouldUseMultipart({ size: 94371841 })).toBe(true);
  });

  it("createMultipartUpload posts folderId and returns uploadId+key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ videoId: "v1", key: "k1", uploadId: "u1", partSize: 1 }), { status: 201 }),
    );
    const a = makeAdapter(() => "folder-9");
    const out = await a.createMultipartUpload({ name: "x.mp4", type: "video/mp4", size: 10, meta: {} } as any);
    expect(out).toEqual({ uploadId: "u1", key: "k1" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.folderId).toBe("folder-9");
  });

  it("listParts maps server shape to S3 shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ parts: [{ partNumber: 1, etag: '"abc"', size: 5 }] }), { status: 200 }),
    );
    const a = makeAdapter(() => undefined);
    const parts = await a.listParts(null, { uploadId: "u1", key: "k1" });
    expect(parts).toEqual([{ PartNumber: 1, ETag: '"abc"', Size: 5 }]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/components/upload-adapter.ts`**

```ts
export const SINGLE_PUT_MAX = Number(process.env.NEXT_PUBLIC_SINGLE_PUT_MAX_BYTES ?? 94371840);

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `POST ${url} failed`);
  return res.json();
}

export function makeAdapter(getFolderId: () => string | undefined) {
  return {
    shouldUseMultipart: (f: { size: number }) => f.size > SINGLE_PUT_MAX,

    getUploadParameters: async (f: File & { meta: Record<string, unknown> }) => {
      const d = await post("/api/uploads", {
        title: f.name, originalFilename: f.name, contentType: f.type || "application/octet-stream",
        size: f.size, folderId: getFolderId(),
      });
      f.meta.videoId = d.videoId;
      return { method: "PUT" as const, url: d.url as string, headers: { "content-type": f.type || "application/octet-stream" } };
    },
    finalizeSingle: async (videoId: string) => {
      const res = await fetch(`/api/uploads/${videoId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error("finalize failed");
    },

    createMultipartUpload: async (f: File & { meta: Record<string, unknown> }) => {
      const d = await post("/api/uploads/create", {
        title: f.name, originalFilename: f.name, contentType: f.type || "application/octet-stream",
        size: f.size, folderId: getFolderId(),
      });
      f.meta.videoId = d.videoId;
      return { uploadId: d.uploadId as string, key: d.key as string };
    },
    signPart: async (_f: unknown, o: { uploadId: string; key: string; partNumber: number }) =>
      ({ url: (await post("/api/uploads/sign-part", o)).url as string }),
    listParts: async (_f: unknown, o: { uploadId: string; key: string }) => {
      const url = `/api/uploads/list-parts?key=${encodeURIComponent(o.key)}&uploadId=${encodeURIComponent(o.uploadId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("listParts failed");
      const { parts } = await res.json();
      return parts.map((p: { partNumber: number; etag: string; size: number }) => ({ PartNumber: p.partNumber, ETag: p.etag, Size: p.size }));
    },
    completeMultipartUpload: async (_f: unknown, o: { uploadId: string; key: string; parts: { PartNumber: number; ETag: string }[] }) => {
      await post("/api/uploads/complete", {
        key: o.key, uploadId: o.uploadId,
        parts: o.parts.map((p) => ({ partNumber: p.PartNumber, etag: p.ETag })),
      });
      return {};
    },
    abortMultipartUpload: async (_f: unknown, o: { uploadId: string; key: string }) => {
      await post("/api/uploads/abort", o).catch(() => {});
    },
  };
}
```

- [ ] **Step 4: Implement `src/components/uploader.tsx`** (`"use client"`, Uppy + Dashboard wiring, uses `makeAdapter`)

```tsx
"use client";
import { useMemo, useRef, useState } from "react";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import { makeAdapter } from "./upload-adapter";

type Folder = { id: string; name: string; parentId: string | null };

export function Uploader({ folders }: { folders: Folder[] }) {
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const folderRef = useRef(folderId);
  folderRef.current = folderId;

  const uppy = useMemo(() => {
    const a = makeAdapter(() => folderRef.current);
    const u = new Uppy({ restrictions: { allowedFileTypes: ["video/*"] }, autoProceed: false });
    u.use(AwsS3, {
      shouldUseMultipart: a.shouldUseMultipart,
      getUploadParameters: a.getUploadParameters as never,
      createMultipartUpload: a.createMultipartUpload as never,
      signPart: a.signPart as never,
      listParts: a.listParts as never,
      completeMultipartUpload: a.completeMultipartUpload as never,
      abortMultipartUpload: a.abortMultipartUpload as never,
    });
    u.on("upload-success", async (file) => {
      const vid = file?.meta?.videoId as string | undefined;
      if (vid && !a.shouldUseMultipart({ size: file!.size ?? 0 })) await a.finalizeSingle(vid);
    });
    return u;
  }, []);

  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold mb-2">영상 업로드</h1>
      <p className="text-sm text-gray-500 mb-4">H.264 MP4 권장. 교내 유선 연결에서 업로드하세요. 큰 파일은 자동으로 나눠 올라가고, 중단되면 이어서 올라갑니다.</p>
      <label className="text-sm">폴더:&nbsp;
        <select value={folderId ?? ""} onChange={(e) => setFolderId(e.target.value || undefined)} className="border px-2 py-1">
          <option value="">(루트)</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <div className="mt-4"><Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} height={420} /></div>
    </main>
  );
}
```

`src/app/(app)/upload/page.tsx`:
```tsx
import { headers } from "next/headers";
import { Uploader } from "@/components/uploader";

async function getFolders() {
  const res = await fetch(`${process.env.NEXTAUTH_URL}/api/folders`, { headers: { cookie: (await headers()).get("cookie") ?? "" }, cache: "no-store" });
  return res.ok ? (await res.json()).folders : [];
}

export default async function UploadPage() {
  return <Uploader folders={await getFolders()} />;
}
```

Add deps: `npm i @uppy/core @uppy/react @uppy/dashboard @uppy/aws-s3`.

- [ ] **Step 5: Run — expect PASS** (3)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Uppy uploader page (single + multipart + resume)"
```

### Task 18: video list / browse page

**Files:**
- Create: `src/app/(app)/page.tsx`, `src/components/video-grid.tsx`, `src/lib/format.ts`
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: `GET /api/videos`, `GET /api/folders`.
- Produces: `src/lib/format.ts` → `export function humanSize(bytes: number | null): string` (`null` → `"—"`, else KB/MB/GB 1 decimal).
- `<VideoGrid initial={{videos, nextCursor}} folders={Folder[]} />` client — 폴더 브레드크럼/드릴다운(쿼리 `?folderId=`), 검색창(디바운스 300ms → `?q=`), "더 보기"(`nextCursor`), 카드 클릭 → `/v/:id`.
- `page.tsx` server: `searchParams` `{folderId?, q?}` 읽어 첫 페이지 fetch → `<VideoGrid>`.

- [ ] **Step 1: Failing test** (`humanSize` 만 유닛; 나머지는 e2e 커버)

`test/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { humanSize } from "../src/lib/format";

describe("humanSize", () => {
  it("formats", () => {
    expect(humanSize(null)).toBe("—");
    expect(humanSize(0)).toBe("0 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(humanSize(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/lib/format.ts`**

```ts
export function humanSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  if (i === 0) return `${bytes} B`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}
```

- [ ] **Step 4: Implement `video-grid.tsx` + `page.tsx`**

`src/components/video-grid.tsx` (`"use client"`): props `initial: { videos: V[]; nextCursor: string | null }`, `folders: Folder[]`. state: `videos`, `cursor`, `q`. `useEffect` 디바운스로 `q`/`folderId` 변경 시 `fetch('/api/videos?...')` 재조회 + `router.replace`. 카드: `<Link href={`/v/${v.id}`}>` 제목 + `humanSize` + 날짜. "더 보기" 버튼 → append.

`src/app/(app)/page.tsx`:
```tsx
import { headers } from "next/headers";
import { VideoGrid } from "@/components/video-grid";

async function api(path: string) {
  const res = await fetch(`${process.env.NEXTAUTH_URL}${path}`, {
    headers: { cookie: (await headers()).get("cookie") ?? "" }, cache: "no-store",
  });
  return res.ok ? res.json() : { videos: [], nextCursor: null, folders: [] };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ folderId?: string; q?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.folderId) qs.set("folderId", sp.folderId);
  if (sp.q) qs.set("q", sp.q);
  const [list, folders] = await Promise.all([api(`/api/videos?${qs}`), api(`/api/folders`)]);
  return <VideoGrid initial={list} folders={folders.folders ?? []} />;
}
```

- [ ] **Step 5: Run — expect PASS** (1)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: video browse/search page"
```

### Task 19: video detail — player, download, share

**Files:**
- Create: `src/app/(app)/v/[id]/page.tsx`, `src/components/video-player.tsx`, `src/components/share-panel.tsx`
- Test: `test/ui/share-panel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/videos/:id/url`, `POST /api/videos/:id/share`, `DELETE /api/share/:id`, `DELETE /api/videos/:id`.
- Produces:
  - `<VideoPlayer videoId={string} />` client — mount 시 `GET /api/videos/:id/url?disposition=inline` → `<video controls src={url}>`. `onError` → url 재요청 1회 재시도.
  - `<SharePanel videoId={string} />` client — "공유 링크 생성" 버튼 (+ 선택적 만료일 `<input type="datetime-local">`) → `POST` → 결과 링크 표시 + 복사 버튼 + "해제" 버튼(`DELETE /api/share/:id`).
  - `page.tsx` server: `prisma.video` 조회 (없으면 `notFound()`), 제목/설명/`humanSize`, `<VideoPlayer>`, 다운로드 버튼(클릭 시 `GET url?disposition=attachment` → `window.location = url`), 업로더 본인/admin 이면 삭제 버튼 + `<SharePanel>`.

- [ ] **Step 1: Failing test**

`test/ui/share-panel.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SharePanel } from "../../src/components/share-panel";

afterEach(() => vi.restoreAllMocks());

describe("SharePanel", () => {
  it("creates a link and shows it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token: "t".repeat(22), url: "https://promo.madp.cloud/s/" + "t".repeat(22) }), { status: 201 }),
    );
    render(<SharePanel videoId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: /공유 링크 생성/ }));
    await waitFor(() => expect(screen.getByDisplayValue(/\/s\/tttt/)).toBeDefined());
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `share-panel.tsx`, `video-player.tsx`, `page.tsx`**

`src/components/share-panel.tsx` (`"use client"`):
```tsx
"use client";
import { useState } from "react";

export function SharePanel({ videoId }: { videoId: string }) {
  const [expiresAt, setExpiresAt] = useState("");
  const [link, setLink] = useState<{ id?: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    const res = await fetch(`/api/videos/${videoId}/share`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(d.error ?? "실패");
    setLink({ url: d.url });
  }

  return (
    <div className="mt-4 border-t pt-4">
      <h2 className="text-sm font-semibold mb-2">공유</h2>
      <label className="text-sm">만료(선택): <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="border px-1" /></label>
      <button onClick={create} className="border px-3 py-1 ml-2 text-sm">공유 링크 생성</button>
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {link && (
        <div className="mt-2 flex gap-2">
          <input readOnly value={link.url} className="border px-2 py-1 text-sm w-96" />
          <button onClick={() => navigator.clipboard.writeText(link.url)} className="border px-2 text-sm">복사</button>
        </div>
      )}
    </div>
  );
}
```

`src/components/video-player.tsx` (`"use client"`): fetch inline url on mount, `<video controls className="w-full max-h-[70vh]" src={url} onError={retryOnce} />`.

`src/app/(app)/v/[id]/page.tsx` server component: `notFound()` when missing; renders player + metadata + download button (client sub-component calling `?disposition=attachment`) + `SharePanel` + delete button gated by `session.user`.

- [ ] **Step 4: Run — expect PASS** (1)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: video detail page (player, download, share)"
```

### Task 20: public share page

**Files:**
- Create: `src/app/s/[token]/page.tsx`
- Test: `test/ui/share-page.test.tsx` (RSC 렌더는 스킵; 대신 `resolveShare` 헬퍼 유닛 테스트)

**Interfaces:**
- Consumes: `prisma`, `src/app/s/[token]/url/route.ts` (Task 15).
- Produces: `src/lib/share.ts` → `export async function resolveShare(token: string): Promise<{ title: string } | null>` — 유효(미revoke, 미만료, video ready)하면 `{ title }`, 아니면 `null`.
- `src/app/s/[token]/page.tsx` (**로그인 불필요**, `(app)` 밖): `resolveShare` → `null` 이면 `notFound()`. else 최소 UI: 제목 + `<video controls src={`/s/${token}/url`}>` + 다운로드 링크 `href={`/s/${token}/url`}` (presigned inline이라 브라우저가 재생; 다운로드는 우클릭 안내 or 별도 `?dl=1` — v1은 재생 위주, 다운로드 버튼은 `/s/:token/url` 로 이동).

- [ ] **Step 1: Failing test**

`test/ui/share-page.test.tsx`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestDb } from "../helpers/pg";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => { db = await startTestDb(); vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma })); });
afterAll(async () => { await db.stop(); });
beforeEach(async () => { vi.resetModules(); await db.prisma.shareLink.deleteMany(); await db.prisma.video.deleteMany(); });

describe("resolveShare", () => {
  it("returns title for a valid link", async () => {
    const v = await db.prisma.video.create({ data: { title: "공개영상", s3Key: "k", originalFilename: "a.mp4", status: "ready" } });
    await db.prisma.shareLink.create({ data: { token: "x".repeat(22), videoId: v.id } });
    const { resolveShare } = await import("../../src/lib/share");
    expect(await resolveShare("x".repeat(22))).toEqual({ title: "공개영상" });
  });
  it("returns null for revoked", async () => {
    const v = await db.prisma.video.create({ data: { title: "t", s3Key: "k", originalFilename: "a.mp4", status: "ready" } });
    await db.prisma.shareLink.create({ data: { token: "y".repeat(22), videoId: v.id, revokedAt: new Date() } });
    const { resolveShare } = await import("../../src/lib/share");
    expect(await resolveShare("y".repeat(22))).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/lib/share.ts` + `page.tsx`**

```ts
import { prisma } from "./db";

export async function resolveShare(token: string): Promise<{ title: string } | null> {
  const link = await prisma.shareLink.findUnique({ where: { token }, include: { video: true } });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) return null;
  if (link.video.status !== "ready") return null;
  return { title: link.video.title };
}
```

`src/app/s/[token]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await resolveShare(token);
  if (!info) notFound();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold mb-3">{info.title}</h1>
      <video controls className="w-full" src={`/s/${token}/url`} />
      <p className="mt-3 text-sm"><a className="underline" href={`/s/${token}/url`}>영상 열기 / 다운로드</a></p>
    </main>
  );
}
```

- [ ] **Step 4: Run — expect PASS** (2)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: public share page"
```

---

## Phase 7 — Ops: health, deploy, bucket setup

### Task 21: health endpoint + seed on boot

**Files:**
- Create: `src/app/api/healthz/route.ts`, `src/instrumentation.ts`
- Test: `test/api/healthz.test.ts`

**Interfaces:**
- Consumes: `prisma`, `s3Internal`/`BUCKET` (Task 3), `seedAdmin` (Task 5).
- Produces (HTTP): `GET /api/healthz` (로그인 불필요, middleware 예외에 이미 포함) → DB `SELECT 1` + `s3Internal.HeadBucket` → 둘 다 OK면 `200 { ok: true }`, 하나라도 실패 `503 { ok: false, db, s3 }`.
- `src/instrumentation.ts` → `export async function register()` — `process.env.NEXT_RUNTIME === "nodejs"` 일 때 `await seedAdmin()` (실패해도 부팅은 계속, 경고 로그). `next.config.ts` 에 `experimental: { instrumentationHook: true }` (Next 15는 기본 활성; 버전에 따라 필요 시 추가).

- [ ] **Step 1: Failing test**

`test/api/healthz.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "../helpers/pg";
import { startS3 } from "../helpers/s3-stub";
import { req } from "../helpers/req";

let db: Awaited<ReturnType<typeof startTestDb>>;
let m: Awaited<ReturnType<typeof startS3>>;
beforeAll(async () => {
  db = await startTestDb(); m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint, S3_ENDPOINT_INTERNAL: m.endpoint, S3_REGION: "us-east-1",
    S3_BUCKET: m.bucket, S3_ACCESS_KEY: m.accessKey, S3_SECRET_KEY: m.secretKey,
  });
  vi.doMock("../../src/lib/db", () => ({ prisma: db.prisma }));
});
afterAll(async () => { await db.stop(); await m.stop(); });

describe("healthz", () => {
  it("200 when db + s3 reachable", async () => {
    vi.resetModules();
    const { GET } = await import("../../src/app/api/healthz/route");
    const r = await GET(req("/api/healthz"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  it("503 when bucket wrong", async () => {
    vi.resetModules();
    process.env.S3_BUCKET = "does-not-exist";
    const { GET } = await import("../../src/app/api/healthz/route");
    const r = await GET(req("/api/healthz"));
    expect(r.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`src/app/api/healthz/route.ts`:
```ts
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { s3Internal, BUCKET } from "@/lib/s3";
import { json } from "@/lib/http";

export async function GET() {
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const s3Ok = await s3Internal.send(new HeadBucketCommand({ Bucket: BUCKET })).then(() => true).catch(() => false);
  if (dbOk && s3Ok) return json({ ok: true });
  return json({ ok: false, db: dbOk, s3: s3Ok }, 503);
}
```

`src/instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seedAdmin } = await import("./lib/seed");
      await seedAdmin();
    } catch (e) {
      console.warn("seedAdmin on boot failed", e);
    }
  }
}
```

- [ ] **Step 4: Run — expect PASS** (2)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: healthz endpoint + admin seed on boot"
```

### Task 22: Dockerfile + compose + entrypoint

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker/entrypoint.sh`
- Modify: `next.config.ts` (already `output: "standalone"` from Task 1)
- Test: `test/build.test.ts` (smoke — `docker build` 는 CI에서만; 로컬은 `next build` 성공 확인)

**Interfaces:**
- Consumes: 모든 앞선 코드.
- Produces: 프로덕션 이미지 `promo-video-api`. 컨테이너 시작 = `prisma migrate deploy` → `node server.js`.
- `docker-compose.yml`: `api` (env_file `/etc/promo/promo.env`, `ports 8080:3000`, `depends_on` 없음 — DB는 외부 Trove). 로컬 개발용 override(`docker-compose.dev.yml`)에 `db`(postgres:15) + `minio` 추가.

- [ ] **Step 1: `Dockerfile`**

```dockerfile
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
CMD ["./entrypoint.sh"]
```

- [ ] **Step 2: `docker/entrypoint.sh`**

```sh
#!/bin/sh
set -e
echo "running migrations..."
node node_modules/prisma/build/index.js migrate deploy
echo "starting server..."
exec node server.js
```

- [ ] **Step 3: `docker-compose.yml`**

```yaml
services:
  api:
    image: registry/promo-video-api:latest
    restart: always
    ports: ["8080:3000"]
    env_file: /etc/promo/promo.env
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

`docker-compose.dev.yml` (로컬):
```yaml
services:
  api:
    image: promo-video-api:dev
    build: .
    env_file: .env
    ports: ["3000:3000"]
    depends_on: [db, minio]
  db:
    image: postgres:15-alpine
    environment: { POSTGRES_USER: promo, POSTGRES_PASSWORD: promo, POSTGRES_DB: promovideo }
    ports: ["5432:5432"]
  minio:
    image: minio/minio:RELEASE.2024-06-13T22-53-53Z
    command: server /data --console-address ":9001"
    environment: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }
    ports: ["9000:9000", "9001:9001"]
```

- [ ] **Step 4: `.dockerignore`**

```
node_modules
.next
.git
test
e2e
docs
*.md
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: `.next/standalone/server.js` produced, no type errors.

Run (optional, Docker): `docker build -t promo-video-api:dev .`
Expected: image builds.

- [ ] **Step 6: `test/build.test.ts`** — assert `next.config.ts` has `output: "standalone"` and `entrypoint.sh` runs `migrate deploy` before `server.js`.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("deploy artifacts", () => {
  it("next config is standalone", () => {
    expect(readFileSync("next.config.ts", "utf8")).toContain('output: "standalone"');
  });
  it("entrypoint migrates before starting", () => {
    const s = readFileSync("docker/entrypoint.sh", "utf8");
    expect(s.indexOf("migrate deploy")).toBeLessThan(s.indexOf("server.js"));
  });
});
```

- [ ] **Step 7: Run — expect PASS** (2)

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: dockerfile, compose, migrate-on-start entrypoint"
```

### Task 23: bucket setup script

**Files:**
- Create: `scripts/setup-bucket.ts`, `scripts/cors.json`, `scripts/lifecycle.json`
- Test: `test/scripts/setup-bucket.test.ts`

**Interfaces:**
- Consumes: `env`, `s3Internal`/`BUCKET` (Task 3).
- Produces: `scripts/setup-bucket.ts` → `export async function setupBucket(): Promise<void>` — `CreateBucket`(이미 있으면 무시) → `PutBucketCors`(origin = `NEXTAUTH_URL`) → `PutBucketLifecycleConfiguration`(AbortIncompleteMultipartUpload 7일). `npm run setup:bucket` 스크립트로도 실행.

- [ ] **Step 1: Failing test** (MinIO 상대)

`test/scripts/setup-bucket.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startS3 } from "../helpers/s3-stub";
import { GetBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

let m: Awaited<ReturnType<typeof startS3>>;
beforeAll(async () => {
  m = await startS3();
  Object.assign(process.env, {
    S3_ENDPOINT_EXTERNAL: m.endpoint, S3_ENDPOINT_INTERNAL: m.endpoint, S3_REGION: "us-east-1",
    S3_BUCKET: "fresh-bucket", S3_ACCESS_KEY: m.accessKey, S3_SECRET_KEY: m.secretKey,
    NEXTAUTH_URL: "https://promo.madp.cloud",
  });
});
afterAll(async () => { await m.stop(); });

describe("setupBucket", () => {
  it("creates bucket + applies CORS with the app origin", async () => {
    vi.resetModules();
    const { setupBucket } = await import("../../scripts/setup-bucket");
    await setupBucket();
    const c = new S3Client({ endpoint: m.endpoint, region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: m.accessKey, secretAccessKey: m.secretKey } });
    const cors = await c.send(new GetBucketCorsCommand({ Bucket: "fresh-bucket" }));
    expect(cors.CORSRules?.[0].AllowedOrigins).toContain("https://promo.madp.cloud");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/setup-bucket.ts`**

```ts
import {
  CreateBucketCommand, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { s3Internal, BUCKET } from "../src/lib/s3";
import { env } from "../src/lib/env";

export async function setupBucket(): Promise<void> {
  await s3Internal.send(new CreateBucketCommand({ Bucket: BUCKET })).catch((e) => {
    if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(String(e?.name))) throw e;
  });
  await s3Internal.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: { CORSRules: [{
      AllowedOrigins: [env.NEXTAUTH_URL], AllowedMethods: ["GET", "PUT"],
      AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3000,
    }] },
  }));
  await s3Internal.send(new PutBucketLifecycleConfigurationCommand({
    Bucket: BUCKET,
    LifecycleConfiguration: { Rules: [{
      ID: "abort-incomplete-mpu", Status: "Enabled", Filter: { Prefix: "" },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
    }] },
  }));
  console.log(`bucket ${BUCKET} ready`);
}

if (require.main === module) setupBucket().catch((e) => { console.error(e); process.exit(1); });
```

Add to `package.json`: `"setup:bucket": "tsx scripts/setup-bucket.ts"` and `npm i -D tsx`.

- [ ] **Step 4: Run — expect PASS** (1)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: bucket setup script (create + cors + lifecycle)"
```

---

## Phase 8 — End-to-end

### Task 24: Playwright happy-path

**Files:**
- Create: `playwright.config.ts`, `e2e/upload.spec.ts`, `e2e/fixtures/tiny.mp4`, `e2e/helpers/stub-auth.ts`
- Modify: `src/lib/auth.ts` — 테스트 모드 credentials provider (아래).

**Interfaces:**
- Consumes: 전체 앱.
- Auth stub: `E2E_AUTH=1` env 이면 `src/lib/auth.ts` providers 에 `Credentials` provider 추가 — `{ email }` 받아 `users` 에 있으면 통과(비밀번호 없음). 프로덕션 빌드에서는 `E2E_AUTH` 미설정이라 비활성. Google provider 는 그대로.
- E2E 스택: `docker-compose.dev.yml` 로 `db` + `minio` 기동 → `npm run setup:bucket` → `E2E_AUTH=1 npm run build && npm start` → Playwright.

- [ ] **Step 1: Add e2e auth provider (guarded)**

`src/lib/auth.ts` providers 배열:
```ts
providers: [
  Google({ /* ...기존... */ }),
  ...(process.env.E2E_AUTH === "1"
    ? [Credentials({
        name: "e2e",
        credentials: { email: {} },
        authorize: async (c) => {
          const email = String(c?.email ?? "");
          const u = await prisma.user.findUnique({ where: { email } });
          return u ? { id: email, email, name: u.name ?? email } : null;
        },
      })]
    : []),
],
```
`signIn` callback: `account?.provider === "credentials" && process.env.E2E_AUTH === "1"` 이면 `return true` (allowlist 체크는 `authorize` 에서 이미 함).

Add test for the guard:

`test/auth-e2e-guard.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

describe("e2e auth provider guard", () => {
  it("is absent when E2E_AUTH unset", async () => {
    delete process.env.E2E_AUTH;
    vi.resetModules();
    const mod = await import("../src/lib/auth");
    // NextAuth config not directly exported; assert via a helper:
    expect(mod.isE2EAuthEnabled()).toBe(false);
  });
  it("is present when E2E_AUTH=1", async () => {
    process.env.E2E_AUTH = "1";
    vi.resetModules();
    const mod = await import("../src/lib/auth");
    expect(mod.isE2EAuthEnabled()).toBe(true);
  });
});
```

Add `export const isE2EAuthEnabled = () => process.env.E2E_AUTH === "1";` to `src/lib/auth.ts`.

- [ ] **Step 2: Run guard test — FAIL then PASS** (2)

- [ ] **Step 3: `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "E2E_AUTH=1 npm start",
    url: "http://localhost:3000/api/healthz",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 4: `e2e/upload.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.beforeAll(async () => {
  await prisma.user.upsert({
    where: { email: "e2e@school.ac.kr" },
    update: { status: "active" },
    create: { email: "e2e@school.ac.kr", role: "admin", status: "active" },
  });
});

async function login(page) {
  await page.goto("/api/auth/signin");
  await page.getByLabel("email").fill("e2e@school.ac.kr");
  await page.getByRole("button", { name: /sign in with e2e/i }).click();
  await page.waitForURL("**/");
}

test("upload a small video, see it listed, play it, share it", async ({ page }) => {
  await login(page);

  await page.goto("/upload");
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/tiny.mp4");
  await page.getByRole("button", { name: /upload/i }).click();
  await expect(page.getByText(/complete|완료|100%/i)).toBeVisible({ timeout: 60_000 });

  await page.goto("/");
  const card = page.getByRole("link", { name: /tiny/i }).first();
  await expect(card).toBeVisible();
  await card.click();

  const video = page.locator("video");
  await expect(video).toHaveJSProperty("readyState", 4, { timeout: 30_000 }).catch(async () => {
    expect(await video.getAttribute("src")).toContain("X-Amz-Signature");
  });

  await page.getByRole("button", { name: /공유 링크 생성/ }).click();
  const shareUrl = await page.getByRole("textbox").inputValue();
  expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{22}$/);

  await page.context().clearCookies();
  await page.goto(new URL(shareUrl).pathname);
  await expect(page.locator("video")).toBeVisible();
});
```

- [ ] **Step 5: Provide `e2e/fixtures/tiny.mp4`** — commit a ~100KB real H.264 mp4 (e.g. `ffmpeg -f lavfi -i testsrc=duration=1:size=128x128:rate=15 -c:v libx264 -pix_fmt yuv420p e2e/fixtures/tiny.mp4`).

- [ ] **Step 6: Run E2E**

```bash
docker compose -f docker-compose.dev.yml up -d db minio
DATABASE_URL=postgres://promo:promo@localhost:5432/promovideo npx prisma migrate deploy
npm run setup:bucket
E2E_AUTH=1 npm run build
npx playwright install --with-deps chromium
E2E_AUTH=1 npx playwright test
```
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "test: playwright happy-path e2e (upload/list/play/share)"
```

---

## Self-Review (완료)

**Spec coverage:**

| Spec 항목 | Task |
|---|---|
| Google OAuth + `hd` 도메인 + allowlist | 5 |
| admin이 UI에서 이메일 추가/삭제/역할 | 7, 8 |
| 마지막 admin 보호 | 7 |
| presigned 단일 PUT (90 MiB 임계값) | 9, 10 |
| presigned Multipart + 재개(list-parts) | 9, 11 |
| 업로드 소유권 검증 | 9, 10, 11 |
| S3 클라이언트 2개(외부 서명 / 내부 호출) | 3 |
| 폴더 트리 | 12, 18 |
| 영상 목록 + 제목 검색 | 13, 18 |
| 영상 삭제(본인/admin) | 13 |
| presigned GET 재생(Range) | 3, 14, 19 |
| 다운로드(`response-content-disposition`) | 3, 14 |
| 공유 링크 생성/해제/만료, 비로그인 접근 | 15, 20 |
| audit_log 모든 mutation | 6, 7, 10, 11, 12, 13, 15 |
| health check (DB + S3) | 21 |
| admin seed on boot | 5, 21 |
| Docker standalone + migrate-on-start | 22 |
| 버킷 CORS + lifecycle(미완료 MPU 7일) | 23 |
| v1 제외(썸네일/트랜스코딩/폴더공유/CDN) | 명시적으로 비구현 |
| 배포 전 검증 11항목 | 배포 런북(아래) — 코드 아님 |

**Placeholder scan:** UI 컴포넌트 일부(`video-grid.tsx`, `video-player.tsx`, `v/[id]/page.tsx` 다운로드 버튼)는 산문 서술 + 인터페이스 명세로 기술. 각 파일의 props/동작/소비 API가 Interfaces 블록에 확정돼 있고 로직 유닛은 순수 함수(`humanSize`, `upload-adapter`, `resolveShare`)로 분리해 테스트가 실제 코드를 검증함. E2E가 전체 wiring 커버.

**Type consistency:** `assertUploadOwner → { videoId }`, `makeAdapter` 콜백이 S3 shape(`PartNumber/ETag/Size`)와 서버 shape(`partNumber/etag/size`) 사이 매핑을 명시. `signGetUrl` opts 시그니처가 Task 3/14/15에서 동일. `SessionUser` 가 `requireUser`/`requireAdmin`/`mockSession` 에서 일관.

## 배포 런북 (코드 아님 — 배포 시 수행)

1. 인프라로부터 확보: RGW access/secret key, 외부/내부 endpoint, Trove `DATABASE_URL`, 도메인 `promo.madp.cloud`, Google OAuth client(승인된 redirect `https://promo.madp.cloud/api/auth/callback/google`).
2. Barbican에 시크릿 저장 → `/etc/promo/promo.env` 렌더 (`.env.example` 키 전부, 실제값).
3. 스펙 6.7 검증 11항목 실행. **10번(Cloudflare orange/grey)** 결과로 `SINGLE_PUT_MAX_BYTES` 확정. **1번(브라우저→S3)** 불가면 중단하고 프록시 폴백 계획으로 전환.
4. `npm run setup:bucket` (내부 endpoint, promo 키) — CORS `AllowedOrigins` 가 `https://promo.madp.cloud` 인지 확인.
5. 이미지 빌드·푸시 → `app-1`, `app-2` 에서 `docker compose up -d`. 컨테이너가 `migrate deploy` 후 기동.
6. `GET https://promo.madp.cloud/api/healthz` → `{ ok: true }` 확인.
7. `SEED_ADMIN_EMAIL` 계정으로 로그인 → `/admin` 에서 홍보부원 이메일 추가.
8. 실제 500 MB+ 파일 업로드 1회, 시크, presigned 만료 후 재생, 업로드 중 새로고침 재개, 쿼터 초과 403 UI 수동 확인.
9. Trove 자동 백업 on + 복구 리허설 1회.
10. `pg_dump` → `promo-video/backups/` 일 cron 등록(운영자 노드).







