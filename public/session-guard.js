/**
 * RHYTHME 프로젝트 세션 관리 스크립트
 * 역할: 세션 고유성 보장, 링크 전파, 인앱 브라우저 경고, 보안 필터링
 */
(function () {
  const KEY = "SESSION_ID";

  // 1. 고유한 UUID 생성 함수
  function generateUUID() {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  // 2. 리포트 페이지 여부 확인 함수
  function isReportPage() {
    const path = window.location.pathname;
    // 리포트/결과 페이지 파일명 리스트
    const reportPages = ["report.html", "result.html", "analysis-report"];
    return reportPages.some(page => path.includes(page));
  }

  // 3. 리포트가 아닌 페이지에서 URL의 SID 제거 (세션 하이재킹 방지)
  window.stripSidOnNonReportPages = function() {
    const url = new URL(location.href);
    const sidInUrl = url.searchParams.get("sid");

    if (sidInUrl && !isReportPage()) {
      console.log("[session-guard] 리포트 페이지가 아니므로 URL에서 외부 SID를 제거하고 세션을 초기화합니다.");
      
      // URL에서 sid 파라미터 삭제
      url.searchParams.delete("sid");
      window.history.replaceState(null, "", url.toString());
      
      // 리포트가 아닌 곳에 sid를 들고 들어왔다면, 새로운 시작을 위해 기존 저장소도 비움
      localStorage.removeItem(KEY);
    }
  };

  // 4. 세션 아이디 가져오기 및 초기화
  function getSid() {
    const urlParams = new URLSearchParams(location.search);
    const urlSid = urlParams.get("sid");
    const storedSid = localStorage.getItem(KEY);

    // 메인 페이지 또는 루트 진입 시
    const isMainPage = location.pathname.endsWith("index.html") || location.pathname === "/";
    
    // 메인에서 URL에 sid가 없다면 무조건 새로 생성 (깨끗한 시작)
    if (isMainPage && !urlSid) {
      const newSid = generateUUID();
      localStorage.setItem(KEY, newSid);
      return newSid;
    }

    // 우선순위: URL SID > 저장된 SID > 새로 생성
    const activeSid = urlSid || storedSid || generateUUID();
    localStorage.setItem(KEY, activeSid);
    return activeSid;
  }

  // 5. URL에 세션 아이디 동기화
  function ensureSidInUrl(sid) {
    if (!sid) return;
    const u = new URL(location.href);
    if (u.searchParams.get("sid") !== sid) {
      u.searchParams.set("sid", sid);
      history.replaceState(null, "", u.toString());
    }
  }

  // 6. 모든 내부 링크에 SID 자동 전파
  function propagateSidToLinks(sid) {
    if (!sid) return;
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(href)) return;

        const u = new URL(href, location.href);
        if (u.origin === location.origin) {
          u.searchParams.set("sid", sid);
          a.setAttribute("href", u.toString());
        }
      } catch {}
    });
  }

  // 7. [전역 함수] 새로운 연구 참여 시작 (세션 강제 교체)
  window.startResearch = function(isMinor) {
    console.log("[session-guard] 새 연구 세션 생성.");
    localStorage.removeItem(KEY);
    const newSid = generateUUID();
    localStorage.setItem(KEY, newSid);

    const nextPath = "step2_consent.html"; 
    const u = new URL(nextPath, location.href);
    u.searchParams.set("sid", newSid);
    if (isMinor) u.searchParams.set("minor", "true");

    location.href = u.toString();
  };

  // 8. 데이터 속성 네비게이션 바인딩
  function bindNavWithSid(sid) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        let targetSid = sid;
        
        if (el.getAttribute("data-new-session") === "true") {
          targetSid = generateUUID();
          localStorage.setItem(KEY, targetSid);
        }

        const path = el.getAttribute("data-nav");
        const u = new URL(path, location.href);
        u.searchParams.set("sid", targetSid);
        location.href = u.toString();
      });
    });
  }

  // 9. 인앱 브라우저(FB/Messenger) 대응
  function isFacebookOrMessengerInApp() {
    const ua = navigator.userAgent || "";
    return /FBAN|FBAV|FB_IAB|FB4A|FBMD|FBSN|FBSS|Facebook|Messenger/i.test(ua);
  }

  function showInAppWarningBar() {
    const bar = document.createElement("div");
    bar.id = "inapp-warning-bar";
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:12px;background:#111;color:#fff;display:flex;gap:10px;align-items:center;justify-content:space-between;font-size:13px;";
    bar.innerHTML = `
      <div><b>내장 브라우저</b>에서는 마이크 권한이 제한될 수 있습니다. <b>외부 브라우저</b> 권장.</div>
      <button onclick="location.reload()" style="padding:8px;border-radius:5px;background:#fff;color:#000;">새로고침</button>
      <button onclick="this.parentElement.remove()" style="background:none;color:#aaa;border:none;">닫기</button>
    `;
    document.body.appendChild(bar);
  }

  // 실행부
  document.addEventListener("DOMContentLoaded", () => {
    // 1단계: 리포트가 아닌데 sid가 붙어있으면 떼어냄
    window.stripSidOnNonReportPages();

    // 2단계: 현재 유효한 sid 확정
    const sid = getSid();
    
    // 3단계: 환경 설정 및 전파
    ensureSidInUrl(sid);
    propagateSidToLinks(sid);
    bindNavWithSid(sid);

    if (isFacebookOrMessengerInApp()) showInAppWarningBar();

    console.log("[session-guard] 최종 활성화된 sid =", sid);
  });
})();