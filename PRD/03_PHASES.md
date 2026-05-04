# GPT 이미지 자동 생성기 — Phase 분리 계획 (v2)

> 한 번에 다 만들면 복잡해져서 품질이 떨어집니다.
> Phase별로 나눠서 각각 "실제로 동작하는 기능"을 완성합니다.

---

## Phase 1: v2 코드 완성 (목표: 1~2일)

### 목표
Chrome Extension이 ChatGPT DOM 변경에 무관하게 이미지를 감지하고,
원하는 카드만 선택해서 실행할 수 있는 안정적인 v2.0.0이 완성된다.

### 작업 목록

#### 0. v1 스냅샷 보존
- [ ] `git add -A && git commit -m "chore: snapshot before v2 refactor"` (미커밋 변경사항 있으면)
- [ ] `git tag v1.0.0`
- [ ] 확인: `git tag -l` → "v1.0.0" 출력

#### 1. Fix 1 — 이미지 완료 감지 교체 (content/content.js)
- [ ] `imgCountSnapshot` 전역 변수 추가
- [ ] `getMainImageCount()` 헬퍼 함수 추가
- [ ] `findStopButton()` 멀티셀렉터 함수 추가 (기존 `SELECTORS.stopButton` 대체)
- [ ] `checkCompletion()` 교체: img count diff → 'image' 신호
- [ ] `SELECTORS.imageContainer`, `SELECTORS.imageElement` 제거
- [ ] `processNext()` 내 `imgCountSnapshot = getMainImageCount()` 삽입 (clickSend 직전)

#### 2. Fix 2 — 딜레이 제거
- [ ] `content/content.js`: `interPromptDelay` 제거, 마지막 `sleep(800)` 고정
- [ ] `content/content.js`: `__gptAutoStart(prompts, delayMs)` → `__gptAutoStart(prompts)` 서명 변경
- [ ] `popup/popup.html`: `.delay-row` 섹션 삭제
- [ ] `popup/popup.css`: `.delay-row`, `.delay-label`, `.delay-select`, `.delay-hint` 삭제
- [ ] `popup/popup.js`: `delayMs` 읽기/전송 코드 제거
- [ ] `background/background.js`: `delayMs: msg.delayMs || 5000` 제거, executeScript args 정리

#### 3. Fix 3 — 체크박스 선택 UI
- [ ] `popup/popup.html`: `select-all-row` div 추가 (전체 선택 버튼 + 선택 카운트 span)
- [ ] `popup/popup.js`: `checkboxes[]` 배열 관리, 행 생성 시 checkbox 삽입
- [ ] `popup/popup.js`: 실행 시 `checkboxes[i].checked` 필터로 선택된 프롬프트만 수집
- [ ] `popup/popup.js`: 드래그 drop 핸들러에 체크 상태 교체 로직 추가
- [ ] `popup/popup.js`: `btnSelectAll` 전체 토글 핸들러
- [ ] `popup/popup.css`: `.select-all-row`, `.prompt-checkbox` 스타일 추가

#### 4. 코드 정리
- [ ] `content/content.js`: `console.log`, `console.warn` → 주요 에러만 남기고 제거
- [ ] `popup/popup.js`: 개발용 `console.log` 제거
- [ ] `background/background.js`: 개발용 `console.log` 제거
- [ ] `manifest.json`: `"version": "2.0.0"` 변경

### "완성" 체크리스트 (실제 동작 검증)
- [ ] ChatGPT에서 이미지 프롬프트 1개 실행 → 180초 타임아웃 없이 "완료" 표시
- [ ] 체크박스 일부만 체크 후 실행 → 체크된 것만 순차 실행됨
- [ ] 딜레이 설정 UI가 팝업에서 사라짐
- [ ] `manifest.json` version `"2.0.0"` 확인
- [ ] `git tag -l` → "v1.0.0" 확인

### Phase 1 시작 프롬프트 (AI에게 전달용)
```
이 PRD를 읽고 Phase 1을 구현해주세요.
@PRD/01_PRD.md
@PRD/04_PROJECT_SPEC.md

Phase 1 범위:
1. content/content.js — Fix 1 (이미지 감지 교체) + Fix 2 (딜레이 제거)
2. popup/popup.html, popup.css, popup.js — Fix 2 (딜레이 UI 제거) + Fix 3 (체크박스 추가)
3. background/background.js — Fix 2 (delayMs 파라미터 정리)
4. manifest.json — version "2.0.0"

반드시 지켜야 할 것:
- 04_PROJECT_SPEC.md의 "절대 하지 마" 목록 준수
- 기존 기능(전역 참고 이미지, MD 임포트, 다운로드) 파괴 금지
- 각 수정 전 반드시 파일을 Read 후 수정
```

---

## Phase 2: 문서화 (목표: Phase 1 완료 후 반나절)

### 전제 조건
- Phase 1이 검증된 상태 (체크리스트 통과)

### 목표
Codex 에이전트가 이 확장의 동작 방식을 읽고 자동으로 프롬프트+파일을 생성할 수 있는 기계가독 문서가 완성된다.

### 작업 목록
- [ ] `EXTENSION_SPEC.md` 작성 (프로젝트 루트)
  - 확장 전체 아키텍처 (Popup / Background / Content 3계층)
  - 메시지 흐름 다이어그램 (텍스트)
  - 주요 API: `START_GENERATION`, `STOP_GENERATION`, `GET_STATUS`, `DOWNLOAD_IMAGES`
  - 카드 구조: prompts[], images[], globalRefImage 형식
  - MD 파일 임포트 형식 (`## 1.`, `## 2.` 헤딩 파싱)
  - Codex 에이전트용 "자동 입력 생성 가이드" 섹션
- [ ] `PRD/README.md` 업데이트 — v2.0.0 기준 반영

### 완성 체크리스트
- [ ] Codex 에이전트가 EXTENSION_SPEC.md만 읽고 유효한 image-prompts.md를 생성할 수 있음

### Phase 2 시작 프롬프트 (AI에게 전달용)
```
gpt-image-auto Chrome 확장의 EXTENSION_SPEC.md를 작성해주세요.

- 파일 위치: C:\...\gpt-image-auto\EXTENSION_SPEC.md (프로젝트 루트)
- 읽어야 할 파일: content/content.js, background/background.js, popup/popup.js
- 목적: Codex 에이전트가 읽고 자동으로 카드뉴스 프롬프트 파일을 생성할 수 있어야 함
- 형식: 순수 마크다운, 코드 스니펫 포함, 다이어그램은 ASCII

포함 섹션:
1. 아키텍처 개요 (3계층: Popup / Service Worker / Content Script)
2. 메시지 API 명세 (모든 메시지 타입)
3. 카드 입력 형식 (프롬프트 구조)
4. MD 파일 임포트 형식
5. Codex 에이전트 연동 가이드 (자동 프롬프트 생성 방법)
```

---

## Phase 3: GitHub 릴리즈 (목표: Phase 2 완료 후 30분)

### 전제 조건
- Phase 1 + 2 완성

### 목표
GitHub Release에 v2.0.0 ZIP을 올려서 팀원이 링크만으로 설치할 수 있다.

### 작업 목록
- [ ] 불필요 파일 제외 목록 확인 (`.kkirikkiri/`, `.claude/`, `*.md` 개발용 파일)
- [ ] 배포용 ZIP 생성:
  ```
  gpt-image-auto-v2.0.0.zip
  ├── manifest.json
  ├── background/background.js
  ├── content/content.js
  ├── content/net-hook.js
  ├── popup/popup.html
  ├── popup/popup.js
  ├── popup/popup.css
  ├── icons/ (icon16.png, icon48.png, icon128.png)
  └── EXTENSION_SPEC.md
  ```
- [ ] GitHub Release 생성 (`v2.0.0` 태그)
- [ ] 릴리즈 노트 초안 작성 (변경사항 + 설치 방법)

### 설치 가이드 (릴리즈 노트 포함 내용)
```
1. ZIP 다운로드 후 압축 해제
2. Chrome → chrome://extensions/ → 개발자 모드 ON
3. "압축 해제된 확장 프로그램 로드" → 압축 해제 폴더 선택
4. ChatGPT(chatgpt.com) 탭 열기 → 확장 아이콘 클릭
```

### 완성 체크리스트
- [ ] GitHub Release 페이지에서 ZIP 다운로드 가능
- [ ] 새 Chrome 프로필에 설치 후 기본 동작 확인

---

## Phase 로드맵 요약

| Phase | 핵심 작업 | 예상 소요 | 상태 |
|-------|----------|----------|------|
| Phase 1: v2 코드 완성 | 3 Fix 구현 + 코드 정리 + git tag | 1~2일 | 시작 전 |
| Phase 2: 문서화 | EXTENSION_SPEC.md | 반나절 | Phase 1 완료 후 |
| Phase 3: GitHub 릴리즈 | ZIP + 릴리즈 노트 | 30분 | Phase 2 완료 후 |
