# 홍보부 영상저장 클라우드 — 설계

- 날짜: 2026-08-31
- 상태: 설계 확정 (구현 전 사용자 리뷰 대기)
- 작성: 홍보부 프로젝트 담당(프론트+백 전부 본인). 인프라(OpenStack)는 별도 담당.

## 1. 목적 / 배경

학교 홍보부가 촬영한 영상을 그동안 Google Drive에 올려 왔으나, Google 자체
throttling으로 대용량 업로드가 느림. SD카드(약 256GB)가 250GB쯤 차면 통째로
올리는 운용이라 업로드 속도가 핵심. 교내 OpenStack 인프라 위에 홍보부 전용
"영상 저장용 클라우드"(Google Drive 유사)를 직접 만들어 배포한다.

### 성공 기준

- 홍보부원이 학교 Google 계정으로 로그인 → 영상 업로드 / 목록 / 다운로드 / 브라우저 재생 / 공유링크 생성 가능.
- 200GB+ 업로드가 교내 유선 회선에서 회선 속도에 근접(앱이 병목이 아님). 중단 후 재개 가능.
- 메타데이터(영상 목록) 자동 백업. 유실 시 복구 가능.
- 운영 인원 1명이 감당 가능한 수준의 단순함.

## 2. 범위

### v1 포함

- 학교 Google OAuth 로그인 (도메인 제한 + allowlist).
- admin이 UI에서 접근 허용 이메일 추가/삭제/역할 변경.
- 영상 업로드: 브라우저 → S3 직접 (presigned URL). 대용량은 S3 Multipart + 재개.
- 폴더(1단계 이상 트리) / 영상 목록 / 제목 검색(`ILIKE`).
- 다운로드 (원본 파일명 유지).
- 브라우저 스트리밍 재생 (HTTP Range).
- 공유 링크: 비로그인 접근, 만료 시각 선택, revoke.

### v1 제외 (v2+)

- 썸네일 / 미리보기 (ffmpeg 워커). `videos.thumb_key` 컬럼만 미리 비워둠.
- 트랜스코딩. 원본만 저장. **천장**: `.mov`/ProRes/HEVC는 브라우저 재생 안 될 수 있음(다운로드는 됨). 업로드 UI에 "H.264 MP4 권장" 안내.
- 폴더 통째 공유 (v1은 영상 단건 공유만).
- 전문 검색, 조회수/통계, 댓글, 버전관리, 휴지통.
- 재생 트래픽용 CDN 캐싱 계층 (presigned는 쿼리스트링 때문에 캐시 키가 매번 달라짐 → signed-cookie 또는 공개 read 전용 경로가 필요. 동시 시청 급증 시 별도 검토).
- 네이티브 모바일 앱 (반응형 웹으로 충분).

## 3. 인프라 전제 (인프라 담당 확인 완료)

| 항목 | 확정값 | 질문번호 |
|---|---|---|
| S3 백엔드 | Ceph RGW (기 구축분 재사용) | A1 |
| 브라우저 → RGW 직접 접근 | **가능** (외부 endpoint 공개, 공인 TLS via Cloudflare) | C15·C17 |
| 버킷 CORS | `PutBucketCors` API로 프로젝트가 직접 설정 | C16 |
| Presigned GET/PUT (SigV4) | 지원, 만료 최대 7일 | B11·B12 |
| Range / `response-content-disposition` | presigned GET에서 동작 | B13·B14 |
| Multipart | Create~Complete 전부 지원, 파트 ETag 정상 반환 | A9·A10 |
| 관리형 DB | Trove PostgreSQL 15 (자동 백업 포함) | F28 |
| 앱 서버 | Nova VM 2대, 인터넷 아웃바운드·내부 RGW 경로 열림, chrony 동기 | D18~D23 |
| 외부 S3 endpoint | `s3.madp.cloud` (Cloudflare edge) | C15 |
| 내부 S3 endpoint | `rgw.internal.madp.cloud` | D21 |
| 앱 도메인 | `promo.madp.cloud` (Cloudflare Tunnel → bastion nginx → 앱 VM) | E24 |
| 5TB 쿼터 | RGW user(=프로젝트) 스코프. 초과 시 PUT/UploadPart `403 QuotaExceeded`, 읽기·삭제는 가능 | A5 |
| 시크릿 | OpenStack Barbican | G31 |

**분기 조건**: C15가 배포 검증에서 "불가"로 뒤집히면 8절(프록시 폴백)로 전환. 이 문서는 "가능" 전제.

## 4. 아키텍처

### 4.1 구성요소

```
학생/홍보부원 브라우저 (Next.js UI, Uppy 업로더, <video> 플레이어)
   │
   ├─ presigned PUT/GET (파일 데이터 직결) ────────▶ Ceph RGW  (s3.madp.cloud, 유일한 파일 저장소)
   │
   └─ 앱 HTTPS ─▶ Cloudflare ─▶ bastion nginx ─▶ 앱 서버 (Nova VM ×2, docker-compose)
                                                    │  · Google OAuth 검증, 권한 판단
                                                    │  · presigned URL 발급 (티켓 발급기, 파일 바이트 통과 안 함)
                                                    │  · 업로드 완료 콜백 → 메타데이터 확정
                                                    │  · 폴더/영상/공유토큰 CRUD, admin allowlist
                                                    │
                                                    └─ TLS ─▶ Trove PostgreSQL (메타데이터)
                                                              │
   앱 서버 → rgw.internal.madp.cloud (Head/List/Complete 등 서버측 S3 호출)
```

- **앱 서버는 영상 바이트를 절대 통과시키지 않음.** presigned URL만 발급. → Nova VM 스펙 작아도 됨, 스케일 걱정 없음.
- 컨테이너: `api`(Next.js standalone) + (선택) 리버스프록시. DB는 Trove(관리형, 컨테이너 아님).
- RGW: 프로젝트 전용 유저 1개 + 키페어 1쌍. 버킷 1개(`promo-video`), prefix로 연도 구분.
- Trove Postgres: 메타데이터만. **유실 = 영상 목록 전부 소실** → 자동 백업 필수(6.3).

### 4.2 S3 클라이언트 2개 (중요)

presigned URL의 host는 **브라우저가 접근할 외부 endpoint**여야 서명이 유효.

| 클라이언트 | endpoint | 용도 |
|---|---|---|
| `s3External` | `https://s3.madp.cloud` | presigned PUT/GET/UploadPart URL **서명 생성 전용** |
| `s3Internal` | `https://rgw.internal.madp.cloud` | 서버측 직접 호출: `HeadObject`, `CreateMultipartUpload`, `ListParts`, `CompleteMultipartUpload`, `AbortMultipartUpload`, `PutBucketCors` |

공통 config: `region: "us-east-1"` (RGW 무시하나 SigV4에 필요), `signatureVersion: s3v4`, `forcePathStyle: true`.

### 4.3 데이터 모델 (PostgreSQL)

```
users
  email          text primary key
  role           text  not null  check (role in ('member','admin'))
  status         text  not null  check (status in ('invited','active'))  default 'invited'
  name           text
  google_sub     text  unique
  created_at     timestamptz not null default now()
  -- admin이 이메일 추가 시 status='invited' 행 삽입. 첫 OAuth 로그인 시 'active' 전환 + name/google_sub 채움.
  -- 로그인 허용 판정 = 이 테이블에 email 존재. 없으면 거부.

folders
  id             uuid primary key
  name           text not null
  parent_id      uuid references folders(id) on delete restrict  -- null = 루트
  created_by     text references users(email)
  created_at     timestamptz not null default now()

videos
  id                 uuid primary key
  folder_id          uuid references folders(id) on delete restrict  -- null = 루트
  title              text not null
  description        text
  s3_key             text not null unique      -- promo-video/{YYYY}/{uuid}.{ext}
  size_bytes         bigint
  content_type       text
  original_filename  text not null
  status             text not null check (status in ('pending','uploading','ready','failed')) default 'pending'
  duration_sec       int
  thumb_key          text                      -- v2, 지금은 항상 null
  uploaded_by        text references users(email)
  created_at         timestamptz not null default now()
  updated_at         timestamptz not null default now()

uploads                     -- Multipart 진행상태 (재개용)
  video_id       uuid primary key references videos(id) on delete cascade
  s3_upload_id   text not null
  part_size      int  not null   -- 바이트, 64 MiB 고정
  parts_json     jsonb not null default '[]'   -- [{partNumber, etag, size}]
  created_at     timestamptz not null default now()

share_links
  id             uuid primary key
  token          text not null unique          -- 22자 base62 random
  video_id       uuid not null references videos(id) on delete cascade
  expires_at     timestamptz                   -- null = 무기한
  created_by     text references users(email)
  created_at     timestamptz not null default now()
  revoked_at     timestamptz

audit_log
  id             bigserial primary key
  actor_email    text
  action         text not null                 -- 'upload','delete','share.create','share.revoke','user.invite','user.remove','role.change'
  target_id      text
  at             timestamptz not null default now()
```

마이그레이션: Prisma. `prisma migrate deploy`를 컨테이너 시작 시 실행.

### 4.4 인증

- **Auth.js (NextAuth v5)** + Google provider. Authorization Code 플로우. 앱 서버가 `oauth2.googleapis.com`에 code→token 교환 (아웃바운드 필요, D20).
- OAuth scope: `openid email profile`.
- 도메인 제한: `hd` 클레임 == `GOOGLE_HD`(학교 Workspace 도메인) + `email_verified` 확인. 그 외 거부.
- 로그인 콜백: `users`에서 email 조회 → 없으면 에러 페이지("접근 권한 없음, 관리자에게 문의"). 있으면 `status='active'` + `name`/`google_sub` upsert.
- 세션: JWT, HttpOnly + Secure 쿠키, `email` + `role` 담음. 만료 12시간, sliding.
- API 보호: 미들웨어에서 세션 확인. `/api/admin/*`, `/admin` 은 `role='admin'` 추가 확인.
- 예외 경로: `/s/:token` (공유 링크), `/healthz`, OAuth 콜백.
- Seed: `SEED_ADMIN_EMAIL` env → 부팅 시 `users`에 `role='admin', status='invited'` 없으면 insert.

## 5. 데이터 흐름

### 5.1 업로드 — 작은 파일 (90 MiB 미만, 단일 PUT)

> **임계값 근거**: S3 외부 endpoint가 Cloudflare 프록시(orange-cloud)면 요청 body 상한 100MB. 90 MiB 이하만 단일 PUT, 초과는 전부 Multipart(파트 64 MiB < 100MB). 배포 검증에서 "S3 endpoint = DNS-only(grey-cloud)"로 확인되면 임계값을 5 GiB로 상향 가능(6.7-10).

1. 브라우저 → 앱: `POST /api/uploads` `{title, description?, folderId?, originalFilename, contentType, size}`
2. 앱: 인증·쿼터(사용량 조회) 확인 → `s3_key = promo-video/{YYYY}/{uuid}.{ext}` → `videos` 행 insert (`status='pending'`) → `s3External`로 단일 presigned PUT URL 발급 (TTL 15분) → `{videoId, url}` 반환
3. 브라우저 → RGW: presigned URL로 `PUT` (진행률 표시)
4. 브라우저 → 앱: `POST /api/uploads/:videoId/complete`
5. 앱 → `s3Internal`: `HeadObject`로 존재·크기 검증 → `videos.status='ready'`, `size_bytes` 확정 → `audit_log`

### 5.2 업로드 — 큰 파일 / 재개 (S3 Multipart)

Uppy `@uppy/aws-s3` (통합 플러그인, single+multipart 모두 처리). 파일 쪼개기·병렬·재시도 자동. 파트 크기 **64 MiB 고정** (최대 10,000 파트 → 640 GiB 파일까지 커버).

앱 엔드포인트 (전부 로그인 필수, `s3_key`가 요청자 소유 업로드인지 `uploads` 테이블 대조):

```
POST /api/uploads/create
   {title, description?, folderId?, originalFilename, contentType, size}
   → videos insert (status='uploading') + s3Internal.CreateMultipartUpload
   → uploads insert {s3_upload_id, part_size}
   → {videoId, key, uploadId, partSize}

POST /api/uploads/sign-part      {key, uploadId, partNumber}
   → s3External presigned UploadPart URL (TTL 1시간)  → {url}

GET  /api/uploads/list-parts     {key, uploadId}
   → s3Internal.ListParts  → 이미 올라간 파트 [{partNumber, etag, size}]  (재개용)

POST /api/uploads/complete       {key, uploadId, parts:[{partNumber, etag}]}
   → s3Internal.CompleteMultipartUpload → videos.status='ready' → audit_log

POST /api/uploads/abort          {key, uploadId}
   → s3Internal.AbortMultipartUpload → videos.status='failed'
```

- 브라우저: 파트 병렬 PUT (동시 4~6개), 각 응답 `ETag` 수집. `uploadId` + 완료 파트 목록을 `localStorage`에 저장.
- 재개: 새로고침/중단 후 → `list-parts`로 서버 확인 → 누락 파트만 `sign-part` 재발급 → 이어서.
- 미완료 방치분: RGW lifecycle `AbortIncompleteMultipartUpload` 7일 (6.1).
- CORS `ExposeHeaders: ETag` 필수 (브라우저 JS가 파트 ETag를 읽어야 complete 가능).

### 5.3 재생 (스트리밍)

1. 브라우저 → 앱: `GET /api/videos/:id/url?disposition=inline`
2. 앱: 권한 확인 → `s3External` presigned GET URL 발급 (TTL 6시간) → `{url}` (또는 302)
3. 브라우저: `<video src="{url}">`. RGW가 Range 지원 → 시크·부분재생 정상.
4. TTL 6시간: 재생 중 만료 드묾. 만료 시 플레이어 `onerror` → url 재요청.

### 5.4 다운로드

- `GET /api/videos/:id/url?disposition=attachment` → presigned GET + `response-content-disposition=attachment; filename="{original_filename}"` 쿼리로 서명 → 302.

### 5.5 공유 링크 (비로그인)

```
POST   /api/videos/:id/share   {expiresAt?}   → {token, url: "https://promo.madp.cloud/s/<token>"}
GET    /s/:token               → 토큰 조회(만료·revoke 체크) → s3External presigned GET로 302
DELETE /api/share/:id          → revoked_at = now()
```

- 공유 페이지 최소 UI: 제목 + `<video>` + 다운로드 버튼.
- 토큰: 22자 base62 random.
- 폴더 공유는 v2.

## 6. 구현 / 배포 상세

### 6.1 S3 (Ceph RGW) 설정

유저/키 (인프라 운영자가 1회):

```
radosgw-admin user create --uid=promo --display-name="Promo Video Cloud"
radosgw-admin key create --uid=promo --key-type=s3 --gen-access-key --gen-secret
radosgw-admin quota set    --uid=promo --quota-scope=user --max-size=5T
radosgw-admin quota enable --uid=promo --quota-scope=user
```

버킷 (앱 배포 시 1회, 위 키로):

```
aws --endpoint-url https://rgw.internal.madp.cloud s3api create-bucket --bucket promo-video
```

- key 규칙: `promo-video/{YYYY}/{uuid}.{ext}`, 썸네일(v2) `promo-video/thumb/{uuid}.jpg`

CORS (`cors.json`):

```json
{ "CORSRules": [ {
  "AllowedOrigins": ["https://promo.madp.cloud"],
  "AllowedMethods": ["GET", "PUT"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders":  ["ETag"],
  "MaxAgeSeconds": 3000
} ] }
```

```
aws --endpoint-url https://rgw.internal.madp.cloud s3api put-bucket-cors \
    --bucket promo-video --cors-configuration file://cors.json
```

Lifecycle (미완료 multipart 정리): `AbortIncompleteMultipartUpload` `DaysAfterInitiation: 7`, `Filter.Prefix: ""`.

파트 파라미터: 최소 5 MiB(마지막 제외), 최대 5 GiB, 최대 10,000 파트. 앱은 64 MiB 고정.

### 6.2 앱 서버 (Nova VM)

- 인스턴스: 2대 (`app-1`, `app-2`), 각 4 vCPU / 8 GiB / 40 GiB. presigned 방식이라 파일 트래픽 없음. 디스크는 로그·이미지용.
- 이미지: Ubuntu 22.04 cloud image. cloud-init으로 `docker-ce` + `docker-compose-plugin`.
- 앞단: 기존 bastion nginx 패턴에 `promo` 등록. 2대 분산이 필요하면 Octavia LB.
- Next.js `output: "standalone"`, 멀티스테이지 Dockerfile. 이미지는 Docker Hub 직접 pull.

`docker-compose.yml`:

```yaml
services:
  api:
    image: registry/promo-video-api:latest
    restart: always
    ports: ["8080:8080"]
    env_file: /etc/promo/promo.env   # Barbican에서 렌더, 0600 root
```

`promo.env` 키:

```
DATABASE_URL          # Trove 접속 문자열, sslmode=require
NEXTAUTH_SECRET
NEXTAUTH_URL          # https://promo.madp.cloud
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_HD             # school.ac.kr
S3_ENDPOINT_EXTERNAL  # https://s3.madp.cloud
S3_ENDPOINT_INTERNAL  # https://rgw.internal.madp.cloud
S3_REGION             # us-east-1
S3_BUCKET             # promo-video
S3_ACCESS_KEY
S3_SECRET_KEY
S3_FORCE_PATH_STYLE   # true
SEED_ADMIN_EMAIL
PRESIGN_PUT_TTL       # 900
PRESIGN_PART_TTL      # 3600
PRESIGN_GET_TTL       # 21600
SINGLE_PUT_MAX_BYTES  # 94371840  (90 MiB) — 검증 후 grey-cloud면 상향
```

### 6.3 DB (Trove PostgreSQL)

```
openstack database instance create promo-db \
  --flavor <db-flavor-id> --size 20 \
  --datastore postgresql --datastore-version 15 \
  --databases promovideo --users promo:<password> \
  --nic net-id=<app-subnet>
```

- 앱 VM 서브넷에서만 접근, 보안그룹 5432 제한, `sslmode=require`.
- 백업: `openstack database backup create promo-db --name promo-db-$(date +%F)` 매일 cron. 보존 7일. 저장소는 RGW/Swift.
- 복구 리허설 1회를 배포 체크리스트에 포함.

### 6.4 도메인 / TLS / 프록시

- `promo.madp.cloud` → Cloudflare Tunnel(bastion) → bastion nginx → `promo.internal.madp.cloud` → 앱 `:8080`.
- TLS termination: Cloudflare edge(공인). 내부 구간은 기존 패턴.
- 앱: `X-Forwarded-Proto` 신뢰, 쿠키 `Secure`.
- 인바운드: 80/443만 (Cloudflare 경유). 앱 VM은 사설망, 직접 노출 없음.

### 6.5 시크릿 관리

- RGW 키 / Google client secret / NextAuth secret / DB 비밀번호: **Barbican** 저장. 배포 스크립트가 읽어 `/etc/promo/promo.env` (0600, root)로 렌더 → compose `env_file` 참조.
- 대안: `ansible-vault` 암호화 `promo.env`를 파이프라인에서만 복호화.
- 담당자 전달: Barbican ACL로 개인 계정 read 권한.
- Git·이미지에 평문 시크릿 금지.

### 6.6 운영 / 모니터링

- 앱 로그: compose `json-file` + rotate (50 MiB × 3). 중앙 수집 필요 시 Loki/promtail.
- RGW 사용량: `radosgw-admin user stats --uid=promo` 일 1회 → 4 TB 도달 시 알림.
- Trove: 인스턴스 상태·백업 성공 여부 알림.
- 헬스체크: 앱 `/healthz` (DB ping + `s3Internal.HeadBucket`). Cloudflare 또는 uptime 체커.
- 백업 정리: Postgres 메타데이터 = 필수·자동. RGW 객체 = Ceph 3x 복제로 충분, 오프사이트는 범위 밖.

### 6.7 배포 전 실제 검증 (전제로 깔았지만 반드시 확인)

1. 학생 개인 브라우저에서 외부 S3 endpoint로 presigned PUT/GET 실제 동작 (C15) — 실패 시 8절로 전환.
2. `PutBucketCors` API가 `promo` 유저 권한으로 통과하는지, 아니면 운영자 수동인지 (C16).
3. presigned GET에 Range, `response-content-disposition` 실제 반영 (B13·B14).
4. `UploadPart` 응답 `ETag` 헤더 정상 (A10) + CORS `ExposeHeaders`로 브라우저 JS가 읽는지.
5. presigned 만료 상한 (B12) — 재생 URL 6시간 허용되는지.
6. S3 endpoint TLS가 공인 CA인지 (C17) — 사설이면 앱 컨테이너에 CA 번들 마운트.
7. 앱 VM → `oauth2.googleapis.com` 아웃바운드 (D20), 앱 VM → 내부 RGW (D21).
8. 앱 VM chrony 동기 상태 — SigV4 시계 오차 (D23).
9. Trove 백업 생성·복구 리허설.
10. **S3 외부 endpoint가 Cloudflare orange-cloud(프록시)인지 grey-cloud(DNS-only)인지** — orange면 body 100MB 상한 → 단일 PUT 임계값 90 MiB 유지. grey면 5 GiB로 상향.
11. Cloudflare가 presigned query-auth 파라미터(`X-Amz-*`)를 변조 없이 통과시키는지.

## 7. 업로드 처리량 예산

앱 설계는 이미 최속 구조(presigned multipart, 병렬, 브라우저→S3 직결, 앱서버 미경유). **네트워크 업링크가 물리적 상한.**

| 업로드 회선 | 실효 속도 | 250 GB 소요 |
|---|---|---|
| 교내 유선 기가비트 (1 Gbps) | ~90–110 MB/s | 40–50분 |
| 교내 wifi | ~15–35 MB/s | 2–5시간 |
| 10 GbE | ~1 GB/s | ~6분 |
| 집 인터넷 업로드 (20–50 Mbps) | 2–6 MB/s | 12–30시간 |

**"굉장히 빠르게"의 현실선 = 교내 유선에서 40~60분.** 5분은 10GbE 이상 아니면 물리적으로 불가.

빠르게 만드는 조건 (요구사항):

1. 업로드는 **교내 유선**에서. wifi/집은 느림(불가피).
2. **USB 3.0+ 카드리더**. USB 2.0 리더는 ~35 MB/s로 자기가 병목.
3. 브라우저 → S3 직접 (C15 = 가능). 프록시 폴백이면 앱서버 NIC가 전교 트래픽과 경쟁 → 느려짐.
4. Uppy 병렬 파트: 동시 4~6개, 파트 64 MiB.
5. 재개 업로드 필수 — 40분 세션은 중간에 끊김. `list-parts` 재개로 처음부터 재전송 방지.

인프라 추가 확인:

- Ceph/RGW 클러스터 쓰기 처리량 상한 — 단일 클라이언트가 기가비트 부어도 받나 (A32).
- access key / 버킷에 rate limit·QoS·대역폭 캡 있나 (A33).
- 업로더 PC가 쓸 수 있는 교내 유선 대역폭 — 기가? 10G? (A34).
- RGW 앞단 LB/프록시 요청 크기·시간 제한 (`client_max_body_size`, 타임아웃) (A35).

## 8. 프록시 폴백 (C15 = "불가"일 때만)

브라우저가 S3 직접 접근 불가로 판명되면:

- **업로드**: `@uppy/tus` + **tusd 컨테이너** 추가. tusd `s3store` 백엔드로 RGW에 직접 씀. 앱은 tusd `pre-finish` 훅으로 메타 등록.
- **스트리밍/다운로드**: `GET /api/videos/:id/stream` — 앱서버가 RGW에서 Range 받아 파이프 (Next.js route handler 스트리밍 응답).
- **비용**: 앱 VM 대역폭·소켓 부담 급증. 스펙 4 vCPU/8 GiB → 8 vCPU/16 GiB + 별도 데이터 디스크(파일당 최대 크기 × 동시 업로드 수). Octavia LB 필수.
- 데이터 모델·인증은 동일.

## 9. 테스트

- **단위** (Vitest): presign 로직(파트번호→URL, 소유권 검증), 공유토큰 검증(만료·revoke), allowlist 로그인 판정, 단일 PUT vs multipart 임계값 분기.
- **통합** (Testcontainers: Postgres + **MinIO**): 업로드 create→sign-part→complete 해피패스 / 남의 `uploadId` 서명 거부(403) / 비로그인 403 / 비-allowlist 로그인 거부 / list-parts 재개.
- **E2E** (Playwright ×1, CI에서 MinIO 상대): Google mock 로그인 → 작은 파일 업로드 → 목록 표시 → 재생 URL 200 + Range 응답 → 공유링크 비로그인 접근.
- **수동 체크리스트** (실제 학교 RGW 상대, 배포 시 1회): 500 MB+ 업로드, 시크 동작, presigned 만료 후 재발급, 재개(업로드 중 새로고침), 쿼터 초과 403 UI.

## 10. 열린 질문

- 폴더 트리 깊이 제한? (v1은 무제한, UI만 브레드크럼)
- 영상 삭제 시 S3 객체 즉시 삭제 vs soft-delete + 유예 (v1은 즉시 삭제 + `audit_log`).
- admin이 남의 업로드 중단 세션을 정리하는 UI 필요? (v1은 lifecycle 7일 자동으로 갈음).
