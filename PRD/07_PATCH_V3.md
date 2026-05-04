# Patch v3 — 다운로드 버그 + 다중 이미지 + Threads 링크

> 생성일: 2026-05-02

---

## Fix 1: 첨부 이미지 다운로드 제외

**문제**: `collectImageUrls()`가 `main` 전체 `img[src]`를 수집하므로
사용자가 ChatGPT에 업로드한 레퍼런스 이미지까지 다운로드됨.

**해결**: `[data-message-author-role="assistant"]` 내부 이미지만 수집.
사용자 메시지(role="user") 내 이미지는 제외됨.

```javascript
// content.js — collectImageUrls, collectRunImages
// main.querySelectorAll → assistantMsgs.querySelectorAll 으로 변경
const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');
```

`getDownloadableImageCount()`와 `getAssistantImageCount()`도 동일하게 수정.

---

## Fix 2: 프롬프트별 최대 3장 이미지 첨부

**변경 사항**:

- `attachedImages[i]`: `null | string` → `string[]` (빈 배열 = 첨부 없음)
- 📎 버튼 클릭 시 현재 첨부 수가 3 미만이면 추가, 3이면 토스트 표시
- 썸네일 영역: 최대 3개 나란히 표시, 각 썸네일에 ✕ 개별 제거 버튼
- `attachImageToChat(images[])`: DataTransfer에 여러 File 한 번에 주입

**content.js 시그니처 변경**:
```javascript
// 이전: attachedImagesList[i] → null | string
// 이후: attachedImagesList[i] → string[] (0~3개)
async function attachImageToChat(base64Array) {
  const dt = new DataTransfer();
  for (const b64 of base64Array) {
    const blob = await (await fetch(b64)).blob();
    const ext = blob.type.split('/')[1] || 'png';
    dt.items.add(new File([blob], `ref.${ext}`, { type: blob.type }));
  }
  // 이후 동일 — DataTransfer에 여러 파일 한번에 주입
}
```

---

## Fix 3: Threads 링크 아이콘

**위치**: `popup.html` 헤더 영역 우측 상단
**링크**: `https://www.threads.com/@kkongdon_story`
**동작**: `chrome.tabs.create({ url })` — 새 탭에서 열기
**로고**: Threads SVG 인라인 (공식 로고 — 변형된 "@" 모양)

```html
<a id="threads-link" title="@kkongdon_story on Threads">
  <svg><!-- Threads 로고 SVG --></svg>
</a>
```
