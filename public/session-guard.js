/**
 * RHYTHME 프로젝트 세션 가드 (최종 수정본)
 */
(function sessionGuard() {
  const KEY = "SESSION_ID";
  const ALT_KEY = "rhythmi_session_id";

  // 1) 초기 설정: 현재 URL에서 SID 추출 (가장 우선순위 높음)
  const urlParams = new URLSearchParams(location.search);
  const urlSid = urlParams.get("sid");

  // 2) 고유 ID 생성 함수
  function generateUUID() {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
  }

  // 3) SID 동기화 함수
  function syncSid(sid) {
    if (!sid) return null;
    window.SESSION_ID = sid;
    try {
      localStorage.setItem(KEY, sid);
      localStorage.setItem(ALT_KEY, sid);
    } catch (e) {}
    return sid;
  }

  // 4) 외부 브라우저 강제 오픈 (SID 유지 로직 추가)
  (function forceExternalOpen() {
    const ua = navigator.userAgent || "";
    const isKakao = /KAKAOTALK/i.test(ua);
    // 인앱 브라우저 체크 (페이스북, 인스타그램 등)
    const isInApp = isKakao || /Instagram/i.test(ua) || /FBAN|FBAV|FB_IAB|Facebook|Messenger/i.test(ua);

    // 이미 외부 브라우저거나 카카오가 아니면 실행 안 함
    if (!isInApp || !isKakao) return;

    const mount = () => {
      // 이미 바가 있으면 생성 안 함
      if (document.getElementById("external-open-bar")) return;

      const bar = document.createElement("div");
      bar.id = "external-open-bar";
      bar.style.cssText = `
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 999999;
        padding: 12px 14px; background: #111; color: #fff; font-size: 14px;
        display: flex; gap: 10px; align-items: center; justify-content: space-between;
      `;
      bar.innerHTML = `
        <div style="line-height:1.2;">
          카카오톡에서는 리포트 확인이 어려울 수 있습니다.<br/>
          <b>안전한 확인을 위해 외부 브라우저로 열기</b>를 눌러주세요.
        </div>
        <button id="openExternalBtn" style="
          padding: 10px 12px; border-radius: 10px; border: 0; font-weight: 700; background: #fee500; color: #000;
        ">외부로 열기</button>
      `;
      document.body.appendChild(bar);

      document.getElementById("openExternalBtn").onclick = () => {
        // [중요] 외부로 나갈 때 현재의 sid를 포함한 URL을 생성
        const currentSid = urlSid || localStorage.getItem(KEY) || localStorage.getItem(ALT_KEY);
        const targetUrl = new URL(location.href);
        if (currentSid) targetUrl.searchParams.set("sid", currentSid);

        location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(targetUrl.toString());
      };
    };

    if (document.body) mount();
    else window.addEventListener("DOMContentLoaded", mount);
  })();

  // 5) 페이지 로직 처리
  const PATH = (location.pathname || "").toLowerCase();
  const isMainPage = PATH === "/" || PATH.endsWith("/index.html") || PATH === "";
  const isReportPage = ["report.html", "result.html", "analysis-report"].some((p) => PATH.includes(p));

  function initSession() {
    const storedSid = localStorage.getItem(KEY) || localStorage.getItem(ALT_KEY);
    
    // 최종 사용할 SID 결정
    let activeSid = urlSid || storedSid;

    // 메인 페이지인데 아무런 SID가 없다면 새로 생성
    if (!activeSid && isMainPage) {
      activeSid = generateUUID();
    }

    if (activeSid) {
      syncSid(activeSid);
    }

    // 메인 페이지라면 URL의 sid 파라미터 제거 (깔끔하게)
    if (isMainPage && urlSid) {
      const u = new URL(location.href);
      u.searchParams.delete("sid");
      history.replaceState(null, "", u.toString());
    }

    // 리포트 페이지나 진행 페이지에서 SID가 URL에 없으면 붙여줌
    if (!isMainPage && activeSid) {
      const u = new URL(location.href);
      if (u.searchParams.get("sid") !== activeSid) {
        u.searchParams.set("sid", activeSid);
        history.replaceState(null, "", u.toString());
      }
    }
  }

  // 실행
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSession);
  } else {
    initSession();
  }
})();