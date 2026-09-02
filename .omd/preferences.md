# Design preferences

<!-- Appended by omd:apply. Fold into DESIGN.md later with "preference 정리해줘". -->

## 2026-08-31

- status: pending
  correction: Google Drive식 조밀한 파일 테이블/행 목록 UI 금지. 영상은 큰 카드 그리드로.
  scope: 영상 목록, 보관함
  authority: user ("구글드라이브로는 하지말고")

- status: pending
  correction: 토큰만 적용한 밋밋한 화면 금지. Toss 감성 = 넉넉한 여백(py-10~12), 자신감 있는 큰 타이포(28px 볼드 페이지 제목), 부드러운 카드(rounded-2xl), 실제 빈 상태(아이콘+안내+CTA), 버튼 상태(hover/pressed/disabled/focus-ring), 친근한 평서체 마이크로카피("~했어요/~올려보세요").
  scope: 전 페이지
  authority: user ("이게 토스 반영된거임?" + "실제 Toss 감성")

## 2026-09-02T05:43:57.492Z — introduced-off-scale-border-radius-round

```omd-meta
id: pref_mtjo7yno_09ea1f05
timestamp: 2026-09-02T05:43:57.492Z
scope: visualTheme
signal: ambient
confidence: inferred
status: pending
source_agent: claude-code
source_context: "/Users/juhyun/orca/workspaces/pr-cloud/rabbitfish/src/components/video-grid.tsx"
```

Introduced off-scale border radius rounded-full(9999px) in /Users/juhyun/orca/workspaces/pr-cloud/rabbitfish/src/components/video-grid.tsx — not in DESIGN.md radius scale

## 2026-09-02T08:33:17.169Z — introduced-off-scale-border-radius-round

```omd-meta
id: pref_mtju9pwx_2a694f8c
timestamp: 2026-09-02T08:33:17.169Z
scope: visualTheme
signal: ambient
confidence: inferred
status: pending
source_agent: claude-code
source_context: "/Users/juhyun/orca/workspaces/pr-cloud/rabbitfish/src/app/(app)/admin/admin-panel.tsx"
```

Introduced off-scale border radius rounded-full(9999px) in /Users/juhyun/orca/workspaces/pr-cloud/rabbitfish/src/app/(app)/admin/admin-panel.tsx — not in DESIGN.md radius scale
