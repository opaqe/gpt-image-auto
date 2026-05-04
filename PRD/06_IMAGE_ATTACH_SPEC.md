# 프롬프트별 이미지 첨부 — 구현 스펙

> AI가 코드를 짤 때 반드시 지켜야 할 규칙.
> 이 문서를 05_IMAGE_ATTACH_PRD.md와 함께 공유하세요.

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `popup/popup.html` | 프롬프트 행에 숨겨진 `<input type="file">` + 썸네일 컨테이너 추가 |
| `popup/popup.css` | 첨부 버튼, 썸네일, 제거 버튼 스타일 |
| `popup/popup.js` | `attachedImages[]` 배열, 파일 선택 핸들러, 썸네일 표시, 실행 시 이미지 전달 |
| `background/background.js` | `images` 배열을 executeScript args로 `__gptAutoStart`에 전달 |
| `content/content.js` | `attachImageToChat(base64)` 함수 추가, `processNext()` 분기 처리 |

---

## 데이터 흐름

```
[팝업 - 파일 선택]
  FileReader.readAsDataURL(file)
    → attachedImages[i] = dataURL (string | null)

[실행 클릭]
  START_GENERATION { prompts, globalPrompt, images: attachedImages }
    → background.js
      → executeScript(__gptAutoStart, [prompts, globalPrompt, images])
        → content.js

[content.js - processNext()]
  const image = images[currentIndex]  // null 또는 base64 string
  if (image) await attachImageToChat(image)
  await typePrompt(combinedPrompt)
  await clickSend()
```

---

## 핵심 구현 상세

### popup.js — attachedImages 관리

```javascript
const PROMPT_COUNT = 10;
const attachedImages = new Array(PROMPT_COUNT).fill(null); // null = 첨부 없음

// 각 행 생성 시
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    attachedImages[i] = e.target.result; // base64 dataURL
    showThumbnail(i, e.target.result);
  };
  reader.readAsDataURL(file);
  fileInput.value = ''; // 같은 파일 재선택 가능
});

// 📎 버튼
const attachBtn = document.createElement('button');
attachBtn.className = 'btn-attach';
attachBtn.textContent = '📎';
attachBtn.addEventListener('click', () => fileInput.click());
```

### popup.js — 실행 시 이미지 전달

```javascript
chrome.runtime.sendMessage({
  type: 'START_GENERATION',
  prompts,
  globalPrompt,
  images: attachedImages.slice(), // 현재 상태 복사본
  tabId
});
```

### background.js — images 전달

```javascript
// __gptAutoStart 호출 시 images 추가
args: [prompts, globalPrompt, images]

// window.__gptAutoStart 시그니처
window.__gptAutoStart(p, gp, imgs)
```

### content.js — attachImageToChat

```javascript
async function attachImageToChat(base64DataUrl) {
  // 1. base64 → Blob → File
  const res = await fetch(base64DataUrl);
  const blob = await res.blob();
  const ext = blob.type.split('/')[1] || 'png';
  const file = new File([blob], `ref-image.${ext}`, { type: blob.type });

  // 2. ChatGPT 파일 입력 찾기 (다중 셀렉터 폴백)
  const fileInput =
    document.querySelector('input[type="file"]') ||
    document.querySelector('input[accept*="image"]');
  if (!fileInput) {
    console.warn('[GPT-Auto] 파일 입력 요소를 찾을 수 없음 — 이미지 첨부 건너뜀');
    return;
  }

  // 3. DataTransfer로 파일 주입
  const dt = new DataTransfer();
  dt.items.add(file);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'files'
  ).set;
  nativeSetter.call(fileInput, dt.files);
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  // 4. 업로드 완료 대기 — ChatGPT 첨부 썸네일 등장 감지
  await waitForImageAttached();
}

async function waitForImageAttached(timeoutMs = 10000) {
  // ChatGPT가 이미지를 처리하면 첨부 미리보기가 DOM에 등장함
  const ATTACH_SELECTORS = [
    '[data-testid="file-thumbnail"]',
    '.file-preview',
    '[class*="attachment"]',
    '[class*="upload"]',
  ];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of ATTACH_SELECTORS) {
      if (document.querySelector(sel)) {
        await sleep(300); // 안정화 대기
        return;
      }
    }
    await sleep(200);
  }
  // 타임아웃: 셀렉터 감지 실패해도 진행 (고정 대기로 폴백)
  console.warn('[GPT-Auto] 이미지 첨부 확인 타임아웃 — 계속 진행');
  await sleep(2000);
}
```

### content.js — processNext() 수정

```javascript
// __gptAutoStart 시그니처 변경
window.__gptAutoStart = (prompts, globalPrompt, images) => {
  queue = prompts;
  globalPromptText = globalPrompt || '';
  attachedImagesList = images || [];  // 새 변수
  // ... 나머지 동일
};

// processNext() 내부 — typePrompt 앞에 삽입
const image = attachedImagesList[currentIndex] || null;
if (image) {
  sendProgress('이미지 첨부 중...');
  await attachImageToChat(image);
}
// 이후 기존 흐름
await typePrompt(prompt);
await sleep(500);
await clickSend();
```

---

## UI 스펙

### 행 구조 (변경 후)
```
.prompt-row
  ├─ .drag-handle (⠿)
  ├─ .prompt-checkbox
  ├─ .prompt-number
  ├─ .prompt-input (textarea)
  ├─ .btn-attach (📎) ← NEW
  ├─ .attach-thumb-wrap ← NEW (이미지 선택 후 표시)
  │   ├─ img.attach-thumb
  │   └─ button.btn-attach-remove (✕)
  └─ .btn-retry (오류 시만 표시)
```

### CSS 핵심
```css
.btn-attach {
  flex-shrink: 0;
  width: 28px; height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  margin-top: 2px;
  transition: background 0.15s;
}

.btn-attach:hover { background: var(--paper); }

.attach-thumb-wrap {
  position: relative;
  flex-shrink: 0;
  width: 32px; height: 32px;
  margin-top: 2px;
}

.attach-thumb {
  width: 32px; height: 32px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.btn-attach-remove {
  position: absolute;
  top: -4px; right: -4px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--danger);
  color: white;
  font-size: 9px;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
```

---

## 절대 하지 마 (DO NOT)

- [ ] `attachedImages`를 localStorage에 저장하지 마 — 용량 초과 위험
- [ ] 이미지 첨부가 실패해도 프롬프트 전체를 중단하지 마 — 경고 로그 후 텍스트만 전송
- [ ] `input[type="file"]`을 click() 자동 호출 시 팝업 컨텍스트 외부에서 호출하지 마
- [ ] content.js에서 base64 이미지를 콘솔에 전체 출력하지 마 (수 MB 문자열)
- [ ] 기존 `__gptAutoStart(p, gp)` 시그니처 2-arg 버전 호환성을 깨지 마 (`images` 기본값 `[]`)
- [ ] ChatGPT 파일 입력 selector가 하나만 실패해도 전체 중단하지 마 — 폴백 체인 사용

---

## 항상 해 (ALWAYS DO)

- [ ] `images` 파라미터에 항상 기본값 `[]` 또는 `null` 처리
- [ ] 이미지 첨부 실패 시 `console.warn` 로그 + 텍스트만으로 계속 진행
- [ ] `attachImageToChat()` 호출 후 충분한 대기 (최소 300ms, 최대 10s)
- [ ] 드래그 순서 변경 시 `attachedImages` 배열도 함께 swap
- [ ] 체크박스로 선택된 프롬프트만 실행 시, 대응하는 이미지도 같은 인덱스로 필터링

---

## Phase 1 시작 프롬프트

```
아래 스펙에 따라 gpt-image-auto Chrome 확장 프로그램에 프롬프트별 이미지 첨부 기능을 추가해줘.

@PRD/05_IMAGE_ATTACH_PRD.md
@PRD/06_IMAGE_ATTACH_SPEC.md

구현할 파일:
- popup/popup.html — 📎 버튼 + 숨겨진 file input + 썸네일 컨테이너
- popup/popup.css — .btn-attach, .attach-thumb-wrap, .btn-attach-remove
- popup/popup.js — attachedImages[] 배열, 파일 선택, 썸네일 표시, 이미지 전달
- background/background.js — images 파라미터 __gptAutoStart에 전달
- content/content.js — attachImageToChat(), waitForImageAttached(), processNext() 수정

반드시 지킬 것:
- 06_IMAGE_ATTACH_SPEC.md의 "절대 하지 마" 목록 준수
- 이미지 첨부 실패해도 텍스트 프롬프트는 계속 전송
- 기존 기능(전역지침, 체크박스, 드래그, 다운로드) 완전히 유지
```
