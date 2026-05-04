# GPT 이미지 자동 생성기 — 프로젝트 스펙 v2

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 플랫폼 | Chrome Extension MV3 | Google의 현재 표준, Service Worker 기반 |
| 스크립팅 | Vanilla JavaScript (ES2022) | 빌드 도구 없음, 번들러 없음 |
| 상태 저장 | `chrome.storage.session` + `localStorage` | 서버 없이 브라우저 내 영속 |
| 이미지 전달 | base64 Data URL | 서버 업로드 없이 ChatGPT에 직접 첨부 |
| 네트워크 훅 | `net-hook.js` (fetch 인터셉터) | ChatGPT API 응답 신호 감지 |
| 배포 | GitHub Release ZIP | 심사 없이 즉시 팀 배포 |

---

## 프로젝트 구조

```
gpt-image-auto/
├── manifest.json              # MV3 선언 (permissions, content_scripts)
├── background/
│   └── background.js          # Service Worker: 상태 관리, 메시지 라우팅
├── content/
│   ├── content.js             # ChatGPT DOM 자동화 엔진
│   └── net-hook.js            # fetch 인터셉터 (rate limit 감지)
├── popup/
│   ├── popup.html             # 확장 팝업 UI
│   ├── popup.js               # 팝업 로직 (카드 관리, 실행, 다운로드)
│   └── popup.css              # 팝업 스타일
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── EXTENSION_SPEC.md          # Codex 에이전트용 동작 명세 (Phase 2)
└── PRD/                       # 설계 문서 (배포 제외 가능)
```

---

## 메시지 API (Popup ↔ Background ↔ Content)

| 메시지 타입 | 방향 | 주요 페이로드 |
|------------|------|-------------|
| `START_GENERATION` | Popup → Background | `{ prompts[], images[][], globalRefImage }` |
| `STOP_GENERATION` | Popup → Background | — |
| `GET_STATUS` | Popup → Background | — |
| `DOWNLOAD_IMAGES` | Popup → Background | `{ type: 'all' \| 'run' }` |
| `PROGRESS_UPDATE` | Background → Popup | `{ currentIndex, total, status }` |
| `ALL_COMPLETE` | Background → Popup | `{ urls[] }` |
| `USER_DECISION_NEEDED` | Content → Background | — |

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] **기존 메시지 타입 이름 변경 금지** — Popup/Background/Content 3곳이 동일 타입 문자열을 사용
- [ ] **`chrome.scripting.executeScript` args 구조 임의 변경 금지** — content.js의 `__gptAutoStart()` 서명과 반드시 일치해야 함
- [ ] **`window.__gptAutoLoaded` 가드 제거 금지** — 제거 시 content.js가 중복 주입될 수 있음
- [ ] **`net-hook.js`를 MAIN world 대신 ISOLATED world에서 실행 금지** — fetch 인터셉터는 반드시 MAIN world에서 동작
- [ ] **localStorage에 대용량 배열 직렬화 저장 금지** — `attachedImages[][]`는 절대 localStorage에 저장하지 마 (용량 초과)
- [ ] **Service Worker에서 DOM 조작 시도 금지** — SW는 DOM 접근 불가, content.js에 위임
- [ ] **`running: true`를 `chrome.storage.session`에 복원 금지** — SW 재시작 후 불일치 원인
- [ ] **기존 파일을 Read 없이 Edit/Write 금지** — 반드시 현재 파일 내용 확인 후 수정

---

## 항상 해 (ALWAYS DO)

- [ ] **파일 수정 전 반드시 Read 도구로 현재 내용 확인**
- [ ] **content.js 수정 시 `__gptAutoLoaded` 가드가 최상단에 유지되는지 확인**
- [ ] **메시지 핸들러 추가 시 Popup, Background, Content 3곳 일관성 확인**
- [ ] **DOM 셀렉터 변경 시 `SELECTORS` 객체를 통해 중앙 관리**
- [ ] **새 이미지 감지 로직은 `imgCountSnapshot` 기반으로만 구현** (클래스명·URL 패턴 신규 추가 금지)
- [ ] **기존 기능(전역 참고 이미지, MD 임포트, 다운로드)이 여전히 동작하는지 검증**

---

## 테스트 방법

```
# Chrome Extension 로드
1. chrome://extensions/ → 개발자 모드 ON
2. "압축 해제된 확장 프로그램 로드" → gpt-image-auto 폴더 선택
3. ChatGPT 탭 열기

# 기본 동작 테스트
4. 확장 아이콘 클릭 → 팝업 열림 확인
5. 이미지 프롬프트 1개 입력 → "실행" → 이미지 생성 → 완료 표시 확인
6. "이번 실행분 다운로드" → 이미지 저장 확인

# Fix 검증
7. Fix 1: 타임아웃 없이 이미지 감지 → 완료 (최대 90초 내)
8. Fix 2: 딜레이 설정 UI 없음 확인
9. Fix 3: 체크박스 일부만 체크 → 선택된 것만 실행됨 확인
```

---

## 배포 방법 (GitHub Release ZIP)

```bash
# 1. Phase 1 완료 후 버전 태그 생성
git tag -a v2.0.0 -m "Release v2.0.0: 이미지 감지 교체 + 체크박스 선택"

# 2. 배포용 파일 선택 (개발용 파일 제외)
# 포함: manifest.json, background/, content/, popup/, icons/, EXTENSION_SPEC.md
# 제외: PRD/, .kkirikkiri/, .claude/, .git/

# 3. ZIP 생성 (Windows PowerShell 예시)
Compress-Archive -Path manifest.json, background, content, popup, icons, EXTENSION_SPEC.md `
  -DestinationPath gpt-image-auto-v2.0.0.zip

# 4. GitHub Release 생성
gh release create v2.0.0 gpt-image-auto-v2.0.0.zip \
  --title "v2.0.0 - 이미지 감지 안정화 + 체크박스 선택" \
  --notes "릴리즈 노트 내용"
```

---

## 알려진 기술 부채 (v3 이후 해결 예정)

코드탐정 분석 결과 기준:

| 항목 | 위치 | 위험도 |
|------|------|--------|
| DOM 셀렉터 ChatGPT 변경 취약 | content.js:18-28 | 높음 |
| failedIndices 팝업 재오픈 시 소멸 | popup.js:36, background.js:119-121 | 중간 |
| SPA 이동 후 MutationObserver dead node | content.js:556 | 중간 |
| base64 이미지 메시지 페이로드 비대화 | popup.js:391-397 | 낮음 |
| rate limit 60초 고정 대기 | content.js:392-396 | 낮음 |

---

## [NEEDS CLARIFICATION]

- [ ] GitHub 저장소 공개/비공개 여부?
- [ ] v2 릴리즈 노트에 포함할 "설치 전제 조건" (Chrome 버전 등)?
