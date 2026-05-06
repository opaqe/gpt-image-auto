// ── 초기 상태 ────────────────────────────────────
let state = {
  running: false, current: 0, total: 0, status: '대기중', tabId: null,
  lastRunComplete: false, successCount: 0, errorCount: 0
};

// Service Worker는 idle 시 종료되어 state가 초기화된다.
// chrome.storage.session에 tabId 등 핵심 값을 저장/복원.
chrome.storage.session.get(['gptAutoState'], (result) => {
  if (result?.gptAutoState) {
    const saved = result.gptAutoState;
    // running은 SW 재시작 시 false로 고정 (중단됐을 수 있음)
    state.tabId         = saved.tabId         || null;
    state.lastRunComplete = saved.lastRunComplete || false;
    state.successCount  = saved.successCount  || 0;
    state.errorCount    = saved.errorCount    || 0;
    state.total         = saved.total         || 0;
    state.current       = saved.current       || 0;
    console.log('[GPT-Auto BG] 저장된 상태 복원됨, tabId:', state.tabId);
  }
});

function persistState() {
  chrome.storage.session.set({ gptAutoState: state }).catch(() => {});
}
// ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_GENERATION') {
    const tabId = msg.tabId;

    console.log('[GPT-Auto BG] START_GENERATION 수신, tabId:', tabId);

    if (!tabId) {
      broadcastToPopup({ type: 'GENERATION_ERROR', error: '탭 ID 없음' });
      return false;
    }

    state = {
      running: true, current: 0, total: msg.prompts.length,
      status: '시작 중...', tabId,
      lastRunComplete: false, successCount: 0, errorCount: 0
    };
    persistState();
    chrome.storage.session.set({ stopRequested: false }).catch(() => {}); // v2.1: 정지 플래그 초기화

    const prompts = msg.prompts;
    const globalPrompt = msg.globalPrompt || '';
    const images = msg.images || [];
    const waitMode = msg.waitMode || 'instant';
    const sizeRatio   = msg.sizeRatio   || null;   // v2.2: 비율 선택값
    const stylePreset = msg.stylePreset || null;   // v2.2: 스타일 선택값
    const fontPreset  = msg.fontPreset  || null;   // v2.2: 글꼴 선택값

    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    }).then(() => {
      return chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: (p, gp, imgs, wm, sr, sp, fp) => {
          if (typeof window.__gptAutoStart === 'function') {
            window.__gptAutoStart(p, gp, imgs, wm, sr, sp, fp);
          }
        },
        args: [prompts, globalPrompt, images, waitMode, sizeRatio, stylePreset, fontPreset]
      });
    }).then(() => {
      console.log('[GPT-Auto BG] __gptAutoStart 호출 성공');
    }).catch(err => {
      console.log('[GPT-Auto BG] executeScript 실패:', err.message);
      state.running = false;
      persistState();
      broadcastToPopup({
        type: 'GENERATION_ERROR',
        error: 'ChatGPT 탭 접근 실패. 탭을 새로고침(F5) 후 다시 실행하세요.'
      });
    });

    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'STOP_GENERATION') {
    const targetTabId = state.tabId;
    state.running = false;
    state.status = '중지됨';
    persistState();
    // v2.1: session에 stopRequested 플래그 저장 — SW 재시작 후에도 content.js가 인식
    chrome.storage.session.set({ stopRequested: true, running: false }).catch(() => {});

    if (targetTabId) {
      // sendMessage 시도 → 실패 시 executeScript 폴백
      chrome.tabs.sendMessage(targetTabId, { type: 'STOP_GENERATION' })
        .catch(() => {
          chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            world: 'ISOLATED',
            func: () => { if (typeof window.__gptAutoStop === 'function') window.__gptAutoStop(); }
          }).catch(() => {});
        });
    }
  }

  if (msg.type === 'PROGRESS_UPDATE') {
    state.current = msg.current;
    state.total = msg.total;
    state.status = msg.status;
    state.running = true;
    persistState(); // v2.2: SW 재시작 후 running 상태 복원을 위해 영속화
    broadcastToPopup(msg);
  }

  if (msg.type === 'ALL_COMPLETE') {
    state.running = false;
    state.status = '완료';
    state.lastRunComplete = true;
    state.successCount = msg.successCount || 0;
    state.errorCount = msg.errorCount || 0;
    state.current = msg.total || state.total;
    persistState();
    chrome.storage.session.set({ stopRequested: false }).catch(() => {}); // v2.1: 완료 후 플래그 클리어
    broadcastToPopup(msg);
  }

  if (msg.type === 'GENERATION_ERROR') {
    broadcastToPopup(msg);
  }

  // v2.2: 팝업 초기화 — lastRunComplete 클리어 + 상태 완전 리셋
  if (msg.type === 'RESET_STATE') {
    state.running = false;
    state.lastRunComplete = false;
    state.successCount = 0;
    state.errorCount = 0;
    state.current = 0;
    state.total = 0;
    state.status = '대기중';
    persistState();
    chrome.storage.session.set({ stopRequested: false }).catch(() => {});
  }

  if (msg.type === 'GET_STATUS') {
    // SW 재시작 시 인메모리 state가 초기화되므로 storage에서 직접 읽어 병합
    // (PROGRESS_UPDATE → persistState()로 저장된 running 상태를 복원)
    chrome.storage.session.get(['gptAutoState'], (result) => {
      const saved = result?.gptAutoState;
      if (saved && !state.running && saved.running) {
        // SW가 재시작돼서 메모리 state는 false지만 storage엔 running=true가 남아 있는 경우
        state.running      = true;
        state.current      = saved.current  || 0;
        state.total        = saved.total    || 0;
        state.status       = saved.status   || '생성 중...';
        state.tabId        = saved.tabId    || null;
        state.lastRunComplete = false; // running 중이면 complete는 아님
      } else if (saved && !state.running) {
        // running=false인 경우에도 lastRunComplete 등 나머지 필드 복원
        state.lastRunComplete = saved.lastRunComplete || false;
        state.successCount    = saved.successCount    || 0;
        state.errorCount      = saved.errorCount      || 0;
        state.total           = saved.total           || 0;
        state.current         = saved.current         || 0;
      }
      sendResponse(state);
    });
    return true; // async sendResponse를 위해 반드시 true 반환
  }

  if (msg.type === 'DOWNLOAD_IMAGES') {
    handleDownload('DOWNLOAD_IMAGES').catch(err =>
      console.error('[GPT-Auto BG] DOWNLOAD_IMAGES 처리 실패:', err.message)
    );
  }

  if (msg.type === 'DOWNLOAD_RUN_IMAGES') {
    handleDownload('DOWNLOAD_RUN_IMAGES').catch(err =>
      console.error('[GPT-Auto BG] DOWNLOAD_RUN_IMAGES 처리 실패:', err.message)
    );
  }

  // content.js가 tabs.sendMessage로 보내던 IMAGE_URLS는 이제 사용 안 하지만
  // 하위 호환성 유지
  if (msg.type === 'IMAGE_URLS') {
    const urls = msg.urls || [];
    downloadUrls(urls);
  }
});

// ── 다운로드 핵심 함수 ────────────────────────────
// tabs.sendMessage 대신 executeScript 사용 — content script 재연결 불필요
async function handleDownload(msgType) {
  // 1) state.tabId 검증 (SW 재시작 후 탭이 닫혔을 수 있음)
  let tabId = state.tabId;
  if (tabId) {
    try {
      await chrome.tabs.get(tabId); // 탭이 존재하는지 확인
    } catch {
      console.log('[GPT-Auto BG] 저장된 tabId 무효 — ChatGPT 탭 재탐색');
      tabId = null;
    }
  }

  // 2) tabId가 없으면 ChatGPT 탭 자동 탐색
  if (!tabId) {
    const tab = await findChatGPTTab();
    tabId = tab?.id || null;
    if (tabId) {
      state.tabId = tabId;
      persistState();
      console.log('[GPT-Auto BG] ChatGPT 탭 재발견, tabId:', tabId);
    }
  }

  if (!tabId) {
    console.error('[GPT-Auto BG] ChatGPT 탭을 찾을 수 없음. 다운로드 취소.');
    broadcastToPopup({
      type: 'GENERATION_ERROR',
      error: 'ChatGPT 탭을 찾을 수 없습니다. ChatGPT 탭을 열어주세요.'
    });
    return;
  }

  // 3) content.js 재주입 (이미 로드됐으면 가드로 무시됨)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    });
  } catch (err) {
    console.error('[GPT-Auto BG] content.js 주입 실패:', err.message);
    broadcastToPopup({
      type: 'GENERATION_ERROR',
      error: 'ChatGPT 탭에 접근할 수 없습니다. 탭을 새로고침 후 다시 시도하세요.'
    });
    return;
  }

  // 4) executeScript로 직접 URL 수집 — 탭 재연결 불필요
  const fnName = msgType === 'DOWNLOAD_IMAGES' ? '__gptCollectAll' : '__gptCollectRun';
  let urls = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (fn) => {
        if (typeof window[fn] === 'function') return window[fn]();
        return [];
      },
      args: [fnName]
    });
    urls = results?.[0]?.result || [];
    console.log('[GPT-Auto BG] 수집된 이미지 URLs:', urls.length, '개');
  } catch (err) {
    console.error('[GPT-Auto BG] URL 수집 실패:', err.message);
    return;
  }

  if (urls.length === 0) {
    console.log('[GPT-Auto BG] 다운로드할 이미지 없음');
    return;
  }

  downloadUrls(urls);
}

function downloadUrls(urls) {
  urls.forEach((url, i) => {
    const ext = getImageExt(url);
    chrome.downloads.download({
      url,
      filename: `gpt-image-${String(i + 1).padStart(2, '0')}.${ext}`,
      conflictAction: 'uniquify'
    });
  });
}
// ─────────────────────────────────────────────────

// URL에서 이미지 확장자 추출. 인식 못하면 'png' 기본값
function getImageExt(url) {
  const m = url.match(/\.(png|webp|jpg|jpeg|gif)(\?|#|$)/i);
  return m ? m[1].toLowerCase() : 'png';
}

async function findChatGPTTab() {
  const tabs = await chrome.tabs.query({
    url: ['https://chatgpt.com/*', 'https://chat.openai.com/*']
  });
  return tabs[0] || null;
}

function broadcastToPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
