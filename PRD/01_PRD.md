# GPT 이미지 자동 생성기 — PRD v2.0.0

> 생성일: 2026-05-04
> 생성 도구: Show Me The PRD
> 버전: v2.0.0 (배포판)

---

## 1. 제품 개요

### 한 줄 요약
ChatGPT에서 카드뉴스 이미지를 10장 순차 자동 생성하는 Chrome 확장 — 셀렉터 독립적 감지·체크박스 선택·배포 패키지를 갖춘 v2.

### 해결하는 문제
- **v1 문제 1**: `checkCompletion()`이 ChatGPT DOM 클래스/CDN URL에 의존 → DOM 업데이트 시 이미지가 화면에 있어도 "180초 타임아웃" 발생
- **v1 문제 2**: 프롬프트 간 불필요한 딜레이 설정 UI — 이미지 완료 즉시 다음을 시작하면 되는데 대기 시간만 낭비
- **v1 문제 3**: 10개 카드 중 원하는 것만 골라 실행하는 기능 없음

### 핵심 가치
- **셀렉터 독립 감지**: ChatGPT DOM이 바뀌어도 "이미지 개수 증가(diff)"로 완료 판단
- **체크박스 선택 실행**: 원하는 카드만 실행 → 실패한 카드만 재실행 워크플로우
- **GitHub Release ZIP 배포**: 설치 가이드 + 릴리즈 노트로 팀 배포 가능

---

## 2. 사용자

### 주요 사용자
- **누구**: 카드뉴스 제작자 (개인, 소규모 팀). 비개발자 포함.
- **상황**: ChatGPT에서 이미지 10장을 하나씩 만드는 반복 작업이 지겨울 때
- **목표**: 프롬프트 목록을 입력하고 "실행" 누르면 이미지 10장이 자동 생성되길 원함

### 사용자 시나리오
1. 사용자가 확장 팝업을 열고 카드별 이미지 프롬프트를 입력 (또는 MD 파일 임포트)
2. 원하는 카드만 체크박스로 선택 → "실행" 클릭
3. ChatGPT 탭에서 자동 순차 실행, 진행 상황이 팝업에 실시간 표시됨
4. 완료 후 "이번 실행분 다운로드" 버튼으로 생성된 이미지 일괄 저장

---

## 3. 핵심 기능 (v2)

| 기능 | 설명 | 우선순위 | 복잡도 |
|------|------|----------|--------|
| Fix 1: 이미지 완료 감지 교체 | img count diff 방식 — 셀렉터 독립적 | P1 | 중간 |
| Fix 2: 딜레이 설정 UI 제거 | 프롬프트 간 고정 800ms, 불필요 UI 삭제 | P1 | 간단 |
| Fix 3: 체크박스 선택 UI | 카드별 체크박스 + 전체 선택/해제 | P1 | 중간 |
| 코드 정리 + 버전 태깅 | console.log 제거, manifest v2.0.0, git tag v1.0.0 | P1 | 간단 |
| EXTENSION_SPEC.md | Codex 에이전트용 확장 동작 명세 문서 | P2 | 간단 |
| GitHub Release ZIP | 설치 가이드 포함 배포 패키지 | P3 | 간단 |

---

## 4. Fix 1 상세: 이미지 완료 감지 교체

### 문제
`checkCompletion()`이 두 가지 취약 가정에 의존:
- `[class*="imagegen-image"]` — ChatGPT 클래스명 변경 시 실패
- `img[src*="dalle/estuary/oaiusercontent"]` — CDN URL 변경 시 실패

### 해결책: 이미지 개수 diff

```javascript
// content.js 상단
let imgCountSnapshot = 0;

// processNext() 내 clickSend() 직전
imgCountSnapshot = getMainImageCount();
await clickSend();

function getMainImageCount() {
  const main = document.querySelector('main') || document.body;
  return main.querySelectorAll('img[src]').length;
}

// checkCompletion() 내 주 신호
if (getMainImageCount() > imgCountSnapshot && !stopBtn) return 'image';

// stop 버튼 멀티셀렉터 (폴백 포함)
function findStopButton() {
  return document.querySelector('[data-testid="stop-button"]')
    || document.querySelector('button[aria-label*="Stop"]')
    || document.querySelector('button[aria-label*="중지"]')
    || null;
}
```

---

## 5. Fix 2 상세: 딜레이 제거

| 파일 | 변경 |
|------|------|
| `content/content.js` | `interPromptDelay` 변수 제거, `sleep(800)` 고정 |
| `content/content.js` | `__gptAutoStart(prompts, delayMs)` → `__gptAutoStart(prompts)` |
| `popup/popup.js` | `delayMs` 수집·전송 코드 제거 |
| `popup/popup.html` | `.delay-row` 섹션 전체 제거 |
| `popup/popup.css` | `.delay-row`, `.delay-label`, `.delay-select`, `.delay-hint` 제거 |
| `background/background.js` | executeScript args에서 `delayMs` 제거 |

---

## 6. Fix 3 상세: 체크박스 선택 UI

### DOM 구조 변경
```
.prompt-row
  ├─ .drag-handle (⠿)
  ├─ .prompt-checkbox  ← NEW: <input type="checkbox" checked>
  ├─ .prompt-number
  └─ .prompt-input (textarea)
```

### 팝업 상단 추가
```html
<div class="select-all-row">
  <button id="btn-select-all">전체 선택</button>
  <span id="select-count">10개 선택됨</span>
</div>
```

### 핵심 로직
```javascript
// 실행 시 선택된 프롬프트만 수집
const prompts = inputs
  .filter((_, i) => checkboxes[i].checked)
  .map(input => input.value.trim())
  .filter(v => v.length > 0);

// 드래그 시 체크 상태 동기화
const srcChecked = checkboxes[dragSrcIndex].checked;
checkboxes[dragSrcIndex].checked = checkboxes[destIndex].checked;
checkboxes[destIndex].checked = srcChecked;
```

---

## 7. 성공 기준

- [ ] ChatGPT 이미지 프롬프트 1개 실행 → 180초 타임아웃 없이 "완료" 표시
- [ ] 체크박스 일부만 체크 후 실행 → 체크된 것만 순차 실행됨
- [ ] 전체 선택/해제 버튼 정상 동작
- [ ] 드래그 후 체크 상태가 올바르게 이동
- [ ] 딜레이 설정 UI가 팝업에서 사라짐
- [ ] `manifest.json` version `"2.0.0"`
- [ ] `git tag v1.0.0` 존재 (`git tag -l` 확인)

---

## 8. 안 만드는 것 (Out of Scope — v2)

- **Chrome Web Store 공개 등록** — 이유: 심사 2~3일 + 개인정보처리방침 필요, 현재 개인/팀 사용
- **자동 업데이트** — 이유: GitHub Release ZIP은 수동 업데이트가 기본
- **다국어(영어) UI** — 이유: 현재 한국어 단일 사용자 대상
- **failedIndices 영속화** — 이유: 코드탐정이 발견한 부채이나 v3 범위
- **에러 로그 서버 전송** — 이유: 서버 인프라 없음

---

## 9. [NEEDS CLARIFICATION]

- [ ] `waitForImageAttached()` 8초 타임아웃을 v2에서도 유지할지?
- [ ] 체크박스 상태를 localStorage에 저장해서 팝업 재오픈 시 복원할지?
