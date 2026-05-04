# GPT 이미지 자동 생성기 — 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 서버/DB 없이 localStorage + Service Worker 세션 스토리지 + 런타임 메모리 3계층을 사용합니다.

---

## 전체 구조

```
[popup 런타임 메모리]  ─── 실행 시 전달 ──▶  [Service Worker 상태]
       │                                              │
       │ 영속 저장                             세션 유지
       ▼                                              ▼
[localStorage]                              [chrome.storage.session]
```

---

## 계층 1: localStorage (팝업 종료 후에도 유지)

### 전역 참고 이미지 (GLOBAL_REF_KEY)
카드뉴스 일관성을 위해 모든 프롬프트에 자동 첨부되는 배경/양식 이미지.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| `gpt-image-auto-global-ref` | base64 Data URL 문자열 | `data:image/png;base64,...` | X |

> **주의**: 이미지 1장이 5MB이면 base64는 약 6.7MB. localStorage 한도(5~10MB) 근접 가능.

### 프롬프트 자동 저장 (v2 신규 — 계획)
팝업이 닫혔다 다시 열려도 입력 내용이 유지됨.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| `gpt-image-auto-prompts` | JSON 배열 (텍스트 10개) | `["카드1 프롬프트", ...]` | X |

---

## 계층 2: chrome.storage.session (Service Worker 재시작 후 복원)

### 실행 상태 (state 객체)
백그라운드 Service Worker가 관리하는 현재 실행 상태.

| 필드 | 설명 | 타입 | 기본값 |
|------|------|------|--------|
| `tabId` | 자동화 중인 ChatGPT 탭 ID | number \| null | null |
| `running` | 현재 실행 중 여부 | boolean | false (복원 안 함) |
| `currentIndex` | 현재 처리 중인 프롬프트 인덱스 | number | 0 |
| `total` | 전체 프롬프트 개수 | number | 0 |
| `lastRunComplete` | 마지막 실행 완료 여부 | boolean | false |
| `runImageUrls` | 이번 실행에서 수집된 이미지 URL 배열 | string[] | [] |

> **설계 결정**: `running`은 의도적으로 복원하지 않음. SW 재시작 후 "실행 중" 상태를 복원하면 실제로는 content.js가 죽어있는데 background가 running=true로 착각하는 불일치 발생.

---

## 계층 3: popup 런타임 메모리 (팝업 닫히면 소멸)

### 카드별 첨부 이미지 (attachedImages)
각 카드에 개별 첨부된 이미지 (전역 참고 이미지와 별개).

| 구조 | 설명 |
|------|------|
| `attachedImages[i]` | i번째 카드의 첨부 이미지 base64 배열 (최대 2~3개) |

> **주의**: 팝업을 닫으면 소멸. 전역 참고 이미지(localStorage)와 달리 영속성 없음. 사용자에게 이 차이가 안내되지 않는 UX 부채 존재 (코드탐정 발견 #8).

### 실패 인덱스 (failedIndices)
실행 후 실패한 카드 번호 목록. 재시도 버튼 표시에 사용.

| 구조 | 설명 |
|------|------|
| `failedIndices` | Set<number> — 실패한 카드 인덱스 |

> **주의**: popup 재오픈 시 복원 안 됨. GET_STATUS 응답에 포함되지 않아 재시도 버튼이 사라지는 UX 부채 (코드탐정 발견 #5).

---

## 계층 4: content.js 런타임 메모리 (페이지/탭 종료 시 소멸)

### 이미지 감지 상태 (v2 변경 포함)

| 변수 | 설명 | v2 변경 |
|------|------|---------|
| `imgCountSnapshot` | 전송 직전 이미지 개수 스냅샷 | **신규** |
| `runImageUrls` | 이번 실행 누적 이미지 URL 배열 | 기존 |
| `imgCountMax` | 감지된 최대 이미지 개수 | 유지 |
| `netSignalResolve` | net-hook으로부터의 신호 콜백 | 유지 |

---

## 메시지 흐름 (변경 없음)

```
[POPUP] ──START_GENERATION { prompts, images }──▶ [BACKGROUND]
                                                         │
                                                  executeScript
                                                         │
                                                         ▼
[POPUP] ◀──PROGRESS_UPDATE { index, total }──── [CONTENT.JS]
[POPUP] ◀──ALL_COMPLETE { urls }──────────────── [CONTENT.JS]
[POPUP] ──STOP_GENERATION──────────────────────▶ [BACKGROUND] ──▶ [CONTENT.JS]
[POPUP] ──DOWNLOAD_IMAGES { type }─────────────▶ [BACKGROUND]
```

---

## 왜 이 구조인가

- **서버 없음**: Chrome Extension이 ChatGPT DOM을 직접 조작 — API 키, 서버 비용, 인증 불필요
- **3계층 분리**: 영속성이 필요한 것만 localStorage에 저장, 나머지는 메모리에 유지하여 용량 절약
- **base64 중앙 집중**: 이미지를 서버 업로드 없이 Data URL로 직접 ChatGPT에 첨부

---

## [NEEDS CLARIFICATION]

- [ ] 카드별 `attachedImages`를 IndexedDB에 영속화할지? (localStorage 용량 문제 해결)
- [ ] `failedIndices`를 `chrome.storage.session`에 포함하여 복원할지?
