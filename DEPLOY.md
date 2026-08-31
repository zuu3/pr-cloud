# 배포 메모

교내 OpenStack VM에 Docker 컨테이너로 배포. 설계 상세는
`docs/superpowers/specs/2026-08-31-promo-video-cloud-design.md`.

## 이미지

`Dockerfile` — Node 20 standalone 빌드. 런 스테이지에 `ffmpeg` 포함
(썸네일·재생시간·코덱 추출, `src/lib/media.ts`). `archiver`(ZIP 스트리밍)는
순수 JS라 추가 패키지 불필요.

컨테이너 시작 시 `docker/entrypoint.sh`가 `prisma migrate deploy` 후
`node server.js` 실행 → 마이그레이션은 자동 적용된다.

## 환경 변수 (`.env.example` 기준)

| 키 | 비고 |
|---|---|
| `DATABASE_URL` | Trove Postgres |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | `NEXTAUTH_URL`은 공개 도메인 (공유 링크 절대 URL에 사용) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_HD` | `GOOGLE_HD=bssm.hs.kr` |
| `S3_ENDPOINT_EXTERNAL` | 브라우저가 접근하는 RGW 주소 (presign 서명 host) |
| `S3_ENDPOINT_INTERNAL` | 서버→RGW 내부 주소 (Head/List/Complete/ffmpeg) |
| `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Ceph RGW |
| `SEED_ADMIN_EMAIL` | 최초 관리자 (`24.036@bssm.hs.kr`) |
| `PRESIGN_PUT_TTL` / `PRESIGN_PART_TTL` / `PRESIGN_GET_TTL` | presign 만료(초) |
| `SINGLE_PUT_MAX_BYTES` / `NEXT_PUBLIC_SINGLE_PUT_MAX_BYTES` | 단일 PUT ↔ 멀티파트 경계. 두 값 동일하게 |
| `STORAGE_QUOTA_BYTES` | 선택. 5TB = `5497558138880`. 설정 시 관리자 대시보드 + 90%↑ 경고 배너 |

## RGW 사전 작업

- 버킷 CORS: `localhost`/공개 도메인에서 `PUT,GET,HEAD` 허용, `ETag` 노출
  (`scripts/setup-bucket.ts` 참고)
- 버킷은 `S3_BUCKET`으로 미리 생성

## 스케줄러 필요 없음

크론은 제거됨. 대신 관리자 페이지(`/admin`) 버튼:

- **미완료 업로드 정리** — 탭이 죽어 `complete` 호출을 놓친 업로드를 스토리지
  기준으로 마무리하거나 24h 경과 시 실패 처리 (`reconcileStuckUploads`)
- **메타데이터 재생성** — 썸네일/`playableInBrowser`가 비어 있는 기존 영상
  백필 (한 번에 최대 500개, 백그라운드)

`/api/uploads/pending`도 열릴 때마다 해당 사용자 것만 자동 복구한다.

## 헬스체크

`GET /api/healthz` → DB(`SELECT 1`) + RGW(`HeadBucket`) 둘 다 통과해야 200,
아니면 503 + `{db, s3}`.

## 레이트 리밋

`src/lib/ratelimit.ts` — **인메모리 고정 윈도우**. 단일 인스턴스 전제.
현재 적용: 업로드 생성 계열 600/분·사용자, ZIP 다운로드 20/분·사용자.
수평 확장 시 Redis 등 외부 저장소로 교체 필요.

## 백업

- Postgres: Trove 스냅샷
- 오브젝트: Ceph 풀 복제 정책에 위임 (앱에서 별도 처리 없음)
- 휴지통은 자동 영구삭제 없음 — 필요 시 관리자가 "휴지통 비우기"(단어 입력 확인)
