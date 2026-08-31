# DESIGN.md — 홍보부 영상 클라우드

> Reference: **Toss (TDS Mobile + toss.im)**, verified 2026-07-11 via oh-my-design catalog (`.claude/data/references/toss/DESIGN.md`).
> This file keeps Toss's **verified tokens** and records **product-specific decisions** for this app (internal desktop-web tool for a school PR club). Product decisions are marked `[product]`.

---

## 1. Atmosphere

재무 결정을 "차분하고 즉시 답할 수 있게" 만드는 Toss의 태도를 영상 관리에 적용. 강한 파랑 액션 컬러 하나, 넉넉한 위계, 군더더기 없는 한국어. 카드/그림자/탭/토스트/다이얼로그를 일반 관례로 지어내지 않는다 — 필요한 것만, 평면 색 레이어링으로.

`[product]` 이 앱은 **데스크톱 웹 내부 도구**다. TDS 토큰(색·타이포·스페이싱·radius)은 그대로 쓰되, 56px 모바일 터치 버튼 기하는 강요하지 않고 아래 `[product]` 컴포넌트 스펙을 따른다.

## 2. Color tokens (verified — 그대로 사용)

| role | hex | 용도 |
|---|---|---|
| primary | `#3182f6` | 유일한 인터랙션 파랑. 주요 액션 버튼, 활성 링크, 포커스 링 |
| primary-hover | `#2272eb` | primary hover/pressed |
| canvas | `#ffffff` | 기본 배경 |
| foreground | `#191f28` | 최상위 텍스트 (제목) |
| body | `#4e5968` | 본문, 중립 액션 텍스트 |
| muted | `#8b95a1` | 보조 텍스트 (날짜, 캡션) |
| surface | `#f2f4f6` | 조용한 중립 레이어 (페이지 바탕, 비활성 영역) |
| border | `#e5e8eb` | divider, outline |
| on-primary | `#ffffff` | primary 위 텍스트 |
| weak-background | `#e8f3ff` | 약한 강조 배경 (선택된 폴더, 정보 배너) |
| weak-foreground | `#1b64da` | weak-background 위 텍스트 |
| danger | `#e42939` | 파괴적/에러 텍스트 (삭제, 검증 실패) |

- 로고 브랜드 블루를 UI primary 대신 쓰지 않는다. UI primary = `#3182f6`.
- shadow 토큰 없음. 평면 색 레이어링(`surface` / `border`)으로 깊이 표현.

## 3. Typography

`[product]` **폰트 패밀리 = Pretendard.** Toss Product Sans는 재배포 권한이 확인되지 않아 사용 불가. Pretendard(오픈 라이선스)로 대체하고, **스케일·weight·line-height는 아래 검증된 TDS 값**을 따른다.

```
--font-sans: "Pretendard Variable", Pretendard, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
```

| role | size | weight | line-height | 용도 |
|---|---:|---:|---|---|
| h1 | 36px | 700 | 54px | 로그인/빈 상태 대제목 정도로 제한 |
| h2 | 30px | 600 | 45px | 페이지 제목 |
| h3 | 24px | 600 | 36px | 섹션 제목, 영상 상세 제목 |
| h4 | 22px | 600 | 33px | 카드 제목(크게), 서브섹션 |
| body | 16px | 400 | 24px | 기본 본문 |
| body-small | 14px | 400 | 21px | 캡션, 날짜, 도움말 |

- monospace 토큰 없음.

## 4. Spacing & radius (verified)

- spacing scale: `4 · 6 · 8 · 16 · 24 · 32` (px). Tailwind: `1 / 1.5 / 2 / 4 / 6 / 8`.
- radius: small surface `4px`~`6px`. 버튼 `8 / 10 / 14 / 16`.
- `[product]` 컨테이너 최대폭 `1120px`, 좌우 패딩 `24px`. 카드 그리드 `gap 16px`.

## 5. Components

### Button — primary `[product, TDS 토큰 기반]`
- bg `#3182f6` / text `#ffffff` / hover bg `#2272eb`
- height `48px` (TDS large), radius `14px`, padding `0 20px`, font `16px / 600`
- states: hover, pressed, disabled(`opacity .4`, `cursor not-allowed`), keyboard focus(`ring-2 ring-primary ring-offset-2`), loading(스피너, **폭 유지**)

### Button — weak `[product, toss.im marketing 토큰 기반]`
- bg `#e8f3ff` / text `#1b64da`
- height `40px`, radius `10px`, padding `0 16px`, font `15px / 600`
- 보조 액션(공유 링크 생성, 폴더 만들기 등)

### Button — ghost `[product]`
- 투명 bg, text `#4e5968`, hover bg `#f2f4f6`, radius `10px`, height `40px`. 취소/닫기.

### Button — danger text `[product, TDS danger 토큰]`
- 투명 bg, text `#e42939`, hover bg `#fdecee`. 삭제/해제.

### Text field `[product, TDS text-field 토큰]`
- box 변형: border `1px solid #e5e8eb`, radius `10px`, height `44px`, padding `0 12px`, font `16px/400`
- focus: border `#3182f6` + `ring-2 ring-primary/20`
- error: border `#e42939`, 아래 `body-small` 에러 텍스트 `#e42939`
- disabled: bg `#f2f4f6`, text `#8b95a1`
- 항상 `<label>` 동반 (visible 또는 `sr-only`)

### Badge `[product, TDS badge 토큰]`
- 상태 라벨 전용, 액션 아님. weak 변형: bg `weak-background`, text `weak-foreground`, radius `6px`, padding `2px 8px`, font `body-small/600`
- 영상 상태(`업로드 중` 등)에 사용. semantic: 진행=weak-blue, 실패=`#fdecee`/`#e42939`.

### Card `[product — extension, not verified TDS]`
- bg `#ffffff`, border `1px solid #e5e8eb`, radius `12px`, padding `16px`. 그림자 없음.
- hover: border `#3182f6`. 클릭 시 상세로 이동.

## 6. Voice & microcopy

Toss 원칙: **"쉽게 답할 수 있게" · "가치 먼저, 비용은 나중에".** 결과와 다음 행동을 정확히 이름 붙인다. 모호한 안심 문구, 설명 없는 약어, 기관체 금지.

- 버튼: 결과를 말한다. `업로드` `공유 링크 만들기` `영상 삭제` `링크 복사`
- 빈 상태: `아직 올린 영상이 없어요. 첫 영상을 올려보세요.`
- 완료: `업로드가 끝났어요.` / `링크를 복사했어요.`
- 에러: 무엇이 왜 막혔는지 + 다음 행동. `저장 공간이 가득 찼어요. 관리자에게 문의해 주세요.`
- 권한 거부: `접근 권한이 없어요. 관리자에게 문의해 주세요.`
- 큰 파일 안내: `큰 파일은 자동으로 나눠서 올라가고, 중간에 끊겨도 이어서 올라가요. 교내 유선 연결을 권장해요.`

## 7. Don't

- Google Drive식 조밀한 파일 테이블(행 높이 낮은 목록) 금지 — 카드 그리드.
- primary 파랑을 장식으로 쓰지 않기. 기능(액션/포커스/활성)에만.
- 그림자·탭·토스트·모달을 관례로 추가하지 않기. 필요할 때 이 파일에 스펙을 먼저 추가.
- Toss Product Sans / Tossface 사용 주장 금지 (라이선스 미확인). Pretendard 사용.
- 16px TDS radius와 7px 마케팅 radius를 평균내지 않기 — 컴포넌트별로 위 표를 따른다.
- 다크모드 v1 제외.

## 8. Tailwind config 매핑 (Task 1에서 반영)

```ts
theme: {
  extend: {
    colors: {
      primary: { DEFAULT: "#3182f6", hover: "#2272eb" },
      canvas: "#ffffff", foreground: "#191f28", body: "#4e5968",
      muted: "#8b95a1", surface: "#f2f4f6", border: "#e5e8eb",
      weak: { bg: "#e8f3ff", fg: "#1b64da" }, danger: "#e42939",
    },
    fontFamily: { sans: ['"Pretendard Variable"', "Pretendard", "-apple-system", "system-ui", "sans-serif"] },
    borderRadius: { sm: "4px", md: "6px", lg: "10px", xl: "12px", "2xl": "14px" },
  },
}
```
