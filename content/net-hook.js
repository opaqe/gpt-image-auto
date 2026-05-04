// MAIN world — script 태그로 주입됨 (content.js가 삽입)
// window.fetch를 후킹해 ChatGPT SSE 스트림을 파싱한 후
// window.postMessage로 ISOLATED world(content.js)에 신호 전달
(function () {
  if (window.__gptNetHookInstalled) return;
  window.__gptNetHookInstalled = true;
  console.log('[GPT-Auto] net-hook installed (MAIN world) ✅');

  const _fetch = window.fetch;

  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0]
      : args[0] instanceof Request ? args[0].url : '';

    const isConversation = url.includes('/backend-api/conversation')
      || url.includes('/backend-anon/conversation')
      || url.includes('/backend-api/f/conversation'); // 실제 이미지 생성 엔드포인트

    if (!isConversation) return _fetch.apply(this, args);

    const response = await _fetch.apply(this, args);

    // 429 rate limit: body 스트림 없이 즉시 신호
    if (response.status === 429) {
      console.log('[GPT-Auto] net-hook → 429 감지, RATE_LIMIT 신호 전송');
      emit('RATE_LIMIT', { waitSec: 60 });
      return response;
    }

    // 정상 응답이 아니거나 body가 없으면 패스
    if (!response.body || response.status >= 400) return response;

    // 응답 body를 읽으면서 원본도 그대로 반환
    const [streamForPage, streamForHook] = response.body.tee();

    parseStream(streamForHook);

    return new Response(streamForPage, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  async function parseStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let imageDetected = false;
    let chunkCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            console.log('[GPT-Auto] net-hook → [DONE] 수신, COMPLETE 신호 전송');
            emit('COMPLETE', { hadImage: imageDetected });
            imageDetected = false;
            continue;
          }

          // 첫 30개 청크 로깅으로 이미지 데이터 위치 파악
          if (chunkCount < 30) {
            console.log('[GPT-Auto] net-hook chunk#' + chunkCount + ':', data.substring(0, 200));
            chunkCount++;
          }

          // rate limit 감지
          if (data.includes('rate_limit_exceeded') || data.includes('generating images too quickly')) {
            let waitSec = 60;
            const m = data.match(/"estimated_wait_seconds"\s*:\s*(\d+)/);
            if (m) waitSec = parseInt(m[1], 10);
            emit('RATE_LIMIT', { waitSec });
            continue;
          }

          let obj;
          try { obj = JSON.parse(data); } catch { continue; }

          // 이미지 생성 신호 감지
          // 1) tool 메시지 추가 = 이미지 생성 도구 호출 시작
          // 2) conversation_async_status = 비동기 이미지 생성 진행 중
          // 3) 기존: asset_pointer / file-XXXXX 패턴 (폴백)
          if (!imageDetected) {
            const raw = JSON.stringify(obj);
            const isToolMsg = obj?.o === 'add' && obj?.v?.message?.author?.role === 'tool';
            const isAsyncStatus = obj?.type === 'conversation_async_status';
            const hasFileId = /file-[A-Za-z0-9]{16,}/.test(raw);
            const hasAsset = raw.includes('asset_pointer') || raw.includes('image_gen_id');
            if (isToolMsg || isAsyncStatus || hasFileId || hasAsset) {
              imageDetected = true;
              emit('IMAGE_DETECTED', {});
            }
          }

          // 완료 감지
          const msg = obj?.message;
          const status = msg?.status || obj?.status;
          const isComplete = obj?.is_complete === true
            || status === 'finished_successfully'
            || obj?.message_stream_complete === true
            || obj?.done === true;

          if (isComplete) {
            emit('COMPLETE', { hadImage: imageDetected });
            imageDetected = false;
          }
        }
      }
    } catch (_) {
      // 스트림 중단 (stop 버튼) — 조용히 종료
    } finally {
      reader.releaseLock();
    }
  }

  function emit(type, payload) {
    window.postMessage({ source: 'gpt-auto-hook', type, ...payload }, '*');
  }
})();
