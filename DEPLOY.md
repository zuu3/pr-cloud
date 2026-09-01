# 배포 메모

교내 OpenStack VM에 Docker 컨테이너로 배포. 설계 상세는
`docs/superpowers/specs/2026-08-31-promo-video-cloud-design.md`.

## 인프라 (2026-09-01 기준)

| 자원 | 주소 | 스펙 | 용도 |
|---|---|---|---|
| VM `pr-dept` | `10.10.1.12` | 2 vCPU / 2GiB | 앱 컨테이너 (SG `pr-dept-web`) |
| VM `pr-dept-s3-endpoint` | `10.10.1.11` | 2 vCPU / 0.5GiB | RGW 앞단 nginx (`pr-dept-s3.madp.cloud`) |
| RDS `pr-dept` | `10.10.1.7:5432` | PostgreSQL 18, 6GiB | 메타데이터 DB |
| Ceph RGW 버킷 | `pr-dept-bucket` | — | 영상 + 썸네일 |

앱 VM 2GiB — `next build`는 절대 여기서 하지 않는다 (빌드 스테이지 RAM 4GB+).
런타임은 컨테이너 ~200–400MB + ffmpeg 스파이크. swap 2GB 권장.

## 배포 방식 2가지

- **A. bare-metal (권장, 2GiB VM)** — CI가 standalone 빌드를 `promo-bundle.tar.gz`로
  묶어 GitHub Release(`bundle` 태그)에 올린다. VM은 node + ffmpeg만 있으면 되고
  systemd로 돌린다. 디스크 ~400MB, RAM ~150–250MB.
- **B. Docker** — `ghcr.io/zuu3/pr-cloud:latest`. 격리되지만 이미지 ~1.4GB.

### A. bare-metal (systemd)

디렉토리 구조: `/opt/promo/releases/<timestamp>/` 안에 각 릴리스, `/opt/promo/current`
가 활성 릴리스로의 심링크. 배포 = 새 디렉토리에 풀고 심링크만 교체(원자적) — 실행
중인 프로세스가 mmap한 파일 위에 덮어쓰지 않는다 (그러면 SIGBUS).

```sh
# 1. node 22 + ffmpeg (Docker 불필요)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg

# 2. 첫 릴리스
REL=/opt/promo/releases/$(date +%Y%m%d-%H%M%S)
sudo mkdir -p "$REL"
curl -fsSL https://github.com/zuu3/pr-cloud/releases/download/bundle/promo-bundle.tar.gz \
  | sudo tar -xz -C "$REL"
sudo chown -R ubuntu:ubuntu /opt/promo
sudo ln -sfn "$REL" /opt/promo/current

# 3. env (deploy/promo.env.example 참고, 0600)
sudo mkdir -p /etc/promo
sudo nano /etc/promo/promo.env
sudo chmod 600 /etc/promo/promo.env

# 4. systemd
sudo cp /opt/promo/current/promo.service /etc/systemd/system/promo.service
sudo systemctl daemon-reload
sudo systemctl enable --now promo
sudo journalctl -u promo -f
curl -s localhost:8080/api/healthz    # {"ok":true}
```

업데이트 (원자적, 자동 롤백 가능):
```sh
sudo bash /opt/promo/current/redeploy.sh
```
문제 생기면 이전 릴리스로:
```sh
sudo ln -sfn /opt/promo/releases/<이전> /opt/promo/current && sudo systemctl restart promo
```

`server.js`는 `PORT`/`HOSTNAME` env를 따른다. `promo.service`가 `PORT=8080`으로
띄우므로 앞단 nginx는 `127.0.0.1:8080`으로 프록시한다.

### B. Docker 이미지 (GitHub Actions → GHCR)

`.github/workflows/release.yml` — `main` push 또는 수동 실행 시
`ghcr.io/zuu3/pr-cloud:latest` (+ `sha-xxxxxxx`) 로 amd64 이미지를 빌드·푸시한다.
VM에서는 빌드하지 않고 pull만 한다.

패키지가 private면 VM에서 로그인 필요:
```
echo <GHCR_READ_PAT> | docker login ghcr.io -u zuu3 --password-stdin
```
(또는 GitHub Packages 설정에서 이미지를 public 으로)

## VM 최초 세팅 (`pr-dept`, ubuntu-24.04-minimal)

```sh
# Docker
curl -fsSL https://get.docker.com | sh

# swap 2GB
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# env 파일
sudo mkdir -p /etc/promo
sudo nano /etc/promo/promo.env      # 아래 "환경 변수" 표대로 채운다 (0600)
sudo chmod 600 /etc/promo/promo.env

# compose 파일 (레포의 docker-compose.yml 복사)
mkdir -p ~/promo && cd ~/promo
curl -fsSLO https://raw.githubusercontent.com/zuu3/pr-cloud/main/docker-compose.yml
```

## 배포 / 업데이트

```sh
cd ~/promo
docker compose pull
docker compose up -d          # entrypoint가 prisma migrate deploy 자동 실행
docker compose logs -f api
curl -s localhost:8080/api/healthz    # {"ok":true} 확인
```

롤백: `image:` 태그를 `sha-<이전>` 로 바꾸고 `docker compose up -d`.

## 앞단 nginx (`pr-dept` VM 또는 별도)

`:443` → `127.0.0.1:8080` 프록시. 업로드는 브라우저가 RGW로 직접 가므로
이 nginx는 HTML/API만 넘긴다 (본문 제한 완화 불필요).
```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

## 이미지 내부

`Dockerfile` — Node 20 standalone 빌드. 런 스테이지에 `ffmpeg` 포함
(썸네일·재생시간·코덱 추출, `src/lib/media.ts`). `archiver`(ZIP 스트리밍)는
순수 JS라 추가 패키지 불필요.

컨테이너 시작 시 `docker/entrypoint.sh`가 `prisma migrate deploy` 후
`node server.js` 실행 → 마이그레이션은 자동 적용된다.

## 환경 변수 (`.env.example` 기준)

| 키 | 비고 |
|---|---|
| `DATABASE_URL` | 관리형 Postgres (RDS/Trove) — VM 디스크가 휘발성이라 DB는 VM에 두지 않는다. `postgresql://u:p@host:5432/db?sslmode=require`; 앞단에 pgBouncer가 있으면 `&pgbouncer=true&connection_limit=1`. Postgres 12+. VM→DB 네트워크가 열려 있어야 entrypoint의 `prisma migrate deploy`가 돈다. 영상/썸네일은 Ceph에 있고 앱은 로컬 디스크에 아무것도 쓰지 않으므로 VM 재생성에 안전하다 |
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

- Postgres: 관리형 DB의 자동 스냅샷/백업 기능
- 오브젝트: Ceph 풀 복제 정책에 위임 (앱에서 별도 처리 없음)
- VM 디스크: 백업 불필요 (상태 없음)
- 휴지통은 자동 영구삭제 없음 — 필요 시 관리자가 "휴지통 비우기"(단어 입력 확인)
