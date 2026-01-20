/**
 * RHYTHME 프로젝트 세션 가드 (수정 버전)
 */
(function forceExternalOpenInKakao() {
  const ua = navigator.userAgent || "";
  const isKakao = /KAKAOTALK/i.test(ua);

  const isInApp =
    isKakao ||
    /Instagram/i.test(ua) ||
    /FBAN|FBAV|FB_IAB|Facebook|Messenger/i.test(ua);

  if (!isInApp || !isKakao) return;

  const cleanUrl = location.href;

  const mount = () => {
    const bar = document.createElement("div");
    bar.style.cssText = `
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 999999;
      padding: 12px 14px; background: #111; color: #fff; font-size: 14px;
      display: flex; gap: 10px; align-items: center; justify-content: space-between;
    `;
    bar.innerHTML = `
      <div style="line-height:1.2;">
        카카오 인앱 브라우저에서는 입력이 막힐 수 있어요.<br/>
        외부 브라우저로 열어주세요.
      </div>
      <button id="openExternalBtn" style="
        padding: 10px 12px; border-radius: 10px; border: 0; font-weight: 700;
      ">외부로 열기</button>
    `;
    document.body.appendChild(bar);

    document.getElementById("openExternalBtn").onclick = () => {
      location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(cleanUrl);
    };
  };

  if (document.body) mount();
  else window.addEventListener("DOMContentLoaded", mount);
})();

(function () {
  const KEY = "SESSION_ID";
  const ALT_KEY = "rhythmi_session_id"; // 변수명을 ALT_KEY로 통일했습니다.

  // 1) 고유 ID 생성 (UUID v4)
  function generateUUID() {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
  }

  // 2) 저장소 읽기
  function readStoredSid() {
    return localStorage.getItem(KEY) || localStorage.getItem(ALT_KEY);
  }

  // 3) 저장소 및 메모리 동기화 (단일 진실 원칙)
  function syncSid(sid) {
    if (!sid) return null;
    window.SESSION_ID = sid;
    try {
      localStorage.setItem(KEY, sid);
      localStorage.setItem(ALT_KEY, sid);
    } catch (e) {
      console.warn("[session-guard] syncSid failed", e);
    }
    return sid;
  }

  window.syncSid = syncSid;

  // 4) 페이지 판별
  const PATH = (location.pathname || "").toLowerCase();
  const isMainPage = PATH === "/" || PATH.endsWith("/index.html") || PATH === "";
  const isReportPage = ["report.html", "result.html", "analysis-report"].some((p) => PATH.includes(p));

  // 5) URL에서 SID 제거 (history 관리)
  function stripSidFromUrl() {
    const u = new URL(location.href);
    if (u.searchParams.has("sid")) {
      u.searchParams.delete("sid");
      history.replaceState(null, "", u.toString());
      console.log("[session-guard] URL에서 SID를 정리했습니다.");
    }
  }

  // 6) 세션 아이디 결정 핵심 로직
  function getSid() {
    const urlParams = new URLSearchParams(location.search);
    const urlSid = urlParams.get("sid");
    const storedSid = readStoredSid();

    // 새로운 링크(urlSid)가 있다면 저장된 값보다 우선합니다.
    const activeSid = urlSid || storedSid || (isMainPage ? generateUUID() : null);

    if (activeSid) {
      syncSid(activeSid);
    }
    return activeSid;
  }

  // 7) URL 및 링크 전파
  function ensureSidInUrl(sid) {
    if (!sid) return;
    const u = new URL(location.href);
    if (u.searchParams.get("sid") !== sid) {
      u.searchParams.set("sid", sid);
      history.replaceState(null, "", u.toString());
    }
  }

  function propagateSidToLinks(sid) {
    if (!sid) return;
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(href)) return;

        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return;

        const targetPath = u.pathname.toLowerCase();
        if (targetPath === "/" || targetPath.endsWith("index.html")) return;

        u.searchParams.set("sid", sid);
        a.setAttribute("href", u.toString());
      } catch (e) {}
    });
  }

  // 8) 인앱 브라우저 경고 (Facebook 계열)
  function checkInApp() {
    const ua = navigator.userAgent || "";
    if (/FBAN|FBAV|FB_IAB|FB4A|FBMD|FBSN|FBSS|Facebook|Messenger/i.test(ua)) {
      const bar = document.createElement("div");
      bar.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:12px;background:#111;color:#fff;display:flex;justify-content:space-between;font-size:13px;";
      bar.innerHTML = `<div><b>인앱 브라우저</b> 권한 제한 주의. 외부 브라우저 권장.</div><button onclick="this.parentElement.remove()" style="color:#fff;background:none;border:none;">닫기</button>`;
      document.body.appendChild(bar);
    }
  }

  // 9) 새 연구 시작 함수
  window.startResearch = function (isMinor) {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ALT_KEY);

    const newSid = generateUUID();
    syncSid(newSid);

    const u = new URL("step2_consent.html", location.origin);
    u.searchParams.set("sid", newSid);
    if (isMinor) u.searchParams.set("minor", "true");
    location.href = u.toString();
  };

  // 실행부
  document.addEventListener("DOMContentLoaded", () => {
    const sid = getSid();

    if (isMainPage) {
      stripSidFromUrl(); // 메인에선 깔끔하게 제거
      checkInApp();
      console.log("[session-guard] 메인: SID 세팅 완료 =", sid);
    } else if (isReportPage) {
      if (sid) ensureSidInUrl(sid);
      console.log("[session-guard] 리포트: SID 유지 =", sid);
    } else {
      // 진행 페이지 (Voice Info, Voice Talk 등)
      if (sid) {
        ensureSidInUrl(sid);
        propagateSidToLinks(sid);
      }
      console.log("[session-guard] 진행 중: SID 전파 =", sid);
    }
  });
})();