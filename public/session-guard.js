/**
 * RHYTHME 프로젝트 세션 가드 (최종 해결사 버전)
 */
(function sessionGuard() {
  const KEY = "SESSION_ID";
  const ALT_KEY = "rhythmi_session_id";

  const urlParams = new URLSearchParams(location.search);
  const urlSid = urlParams.get("sid");

  // 페이지 판별
  const PATH = (location.pathname || "").toLowerCase();
  const isMainPage = PATH === "/" || PATH.endsWith("/index.html") || PATH === "";
  const isReportPage = ["report.html", "result.html", "analysis-report"].some((p) => PATH.includes(p));
  const isProgressPage = !isMainPage && !isReportPage;

 if (!sid) {
  console.log("[session-guard] no sid yet (waiting for user start)");
  return;
}

  function syncSid(sid) {
    if (!sid) return null;
    window.SESSION_ID = sid;
    try {
      localStorage.setItem(KEY, sid);
      localStorage.setItem(ALT_KEY, sid);
    } catch (e) {}
    return sid;
  }

  // URL 파라미터 강제 동기화 (진행 페이지용)
  function ensureSidInUrl(sid) {
    const u = new URL(location.href);
    if (u.searchParams.get("sid") !== sid) {
      u.searchParams.set("sid", sid);
      window.history.replaceState(null, "", u.toString());
    }
  }

  // 메인 전용: URL 청소
  function clearUrlFromMain() {
    const u = new URL(location.href);
    if (u.searchParams.has("sid")) {
      u.searchParams.delete("sid");
      window.history.replaceState(null, "", u.pathname);
    }
  }

  // 카카오 외부 브라우저 바 (SID 보존형)
  (function initKakaoBar() {
    if (!/KAKAOTALK/i.test(navigator.userAgent)) return;
    const mount = () => {
      const bar = document.createElement("div");
      bar.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:999999;padding:12px 14px;background:#111;color:#fff;font-size:14px;display:flex;align-items:center;justify-content:space-between;`;
      bar.innerHTML = `<div>카카오톡에서는 리포트가 열리지 않을 수 있습니다.</div>
        <button id="extBtn" style="padding:10px;border-radius:8px;background:#fee500;font-weight:700;border:0;">외부로 열기</button>`;
      document.body.appendChild(bar);
      document.getElementById("extBtn").onclick = () => {
        const sid = urlSid || localStorage.getItem(KEY) || localStorage.getItem(ALT_KEY);
        const target = new URL(location.href);
        if (sid) target.searchParams.set("sid", sid);
        location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(target.toString());
      };
    };
    if (document.body) mount(); else window.addEventListener("DOMContentLoaded", mount);
  })();
function initSession() {
    // 1. 저장소 접근 시 에러 방지 (일부 시크릿 모드 대응)
    let storedSid = null;
    try {
      storedSid = localStorage.getItem(KEY) || localStorage.getItem(ALT_KEY);
    } catch (e) {
      console.warn("Storage access denied");
    }

    let activeSid = urlSid || storedSid;

    // [핵심] 2. 페이지 판별을 하기도 전에, activeSid가 보이면 무조건 전역 변수에 먼저 꽂습니다.
    // 이렇게 해야 report.js가 뒤늦게 실행되어도 값을 바로 가져갈 수 있습니다.
    if (activeSid) {
      window.SESSION_ID = activeSid; 
      console.log("[session-guard] Global SID set immediately:", activeSid);
    }

    // 1) 메인 페이지 처리
    if (isMainPage) {
      if (!activeSid) activeSid = generateUUID();
      syncSid(activeSid);
      clearUrlFromMain();
      return;
    }

    // 2) 리포트 페이지 처리
    if (isReportPage) {
      if (!activeSid) {
        alert("리포트 정보가 없습니다. 메인으로 이동합니다.");
        location.href = "index.html";
        return;
      }
      syncSid(activeSid);
      ensureSidInUrl(activeSid);
      return;
    }

    // 3) 진행 페이지 처리
    if (isProgressPage) {
      if (!activeSid) {
        alert("세션이 만료되었습니다. 메인으로 이동합니다.");
        location.href = "index.html";
        return;
      }
      syncSid(activeSid);
      ensureSidInUrl(activeSid);
    }
  }

  initSession();
})();