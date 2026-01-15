/**
 * RHYTHME 프로젝트 세션 가드 (최종 통합 버전)
 * 역할: 페이지 성격에 따른 SID 최적화 관리
 */
(function () {
  const KEY = "SESSION_ID";

  // 1) 고유 ID 생성 (UUID v4)
  function generateUUID() {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
  }

  // 2) 페이지 판별 로직
  const PATH = (location.pathname || "").toLowerCase();
  const isMainPage = PATH === "/" || PATH.endsWith("/index.html") || PATH === "";
  const isReportPage = ["report.html", "result.html", "analysis-report"].some((p) => PATH.includes(p));
  const isProgressPage = !isMainPage && !isReportPage; // 실제 검사 진행 중인 페이지들

  // 3) URL에서 sid 파라미터 강제 제거 함수
  function stripSidFromUrl() {
    const u = new URL(location.href);
    if (u.searchParams.has("sid")) {
      u.searchParams.delete("sid");
      history.replaceState(null, "", u.toString());
      console.log("[session-guard] URL에서 SID를 제거했습니다.");
    }
  }

  // 4) 세션 아이디 결정 로직
  function getSid() {
    const urlSid = new URLSearchParams(location.search).get("sid");
    const storedSid = localStorage.getItem(KEY);

    if (isReportPage) {
      // 리포트: URL에 있는 것을 최우선으로 하되 저장소는 건드리지 않음
      return urlSid || storedSid;
    }

    if (isMainPage) {
      // 메인: 저장된 것만 반환 (없으면 null), URL에 있는 타인의 SID는 무시
      return storedSid;
    }

    // 진행 페이지: URL > 저장소 > 신규 발급
    const sid = urlSid || storedSid || generateUUID();
    if (sid) localStorage.setItem(KEY, sid);
    return sid;
  }

  // 5) URL에 sid 동기화
  function ensureSidInUrl(sid) {
    if (!sid) return;
    const u = new URL(location.href);
    if (u.searchParams.get("sid") !== sid) {
      u.searchParams.set("sid", sid);
      history.replaceState(null, "", u.toString());
    }
  }

  // 6) 내부 링크 전파 (메인으로 가는 링크는 제외)
  function propagateSidToLinks(sid) {
    if (!sid) return;
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(href)) return;

        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return;

        // 메인 페이지로 돌아가는 링크에는 SID를 붙이지 않음 (세션 오염 방지)
        const targetPath = u.pathname.toLowerCase();
        if (targetPath === "/" || targetPath.endsWith("index.html")) return;

        u.searchParams.set("sid", sid);
        a.setAttribute("href", u.toString());
      } catch (e) {}
    });
  }

  // 7) data-nav 네비게이션 처리
  function bindNavWithSid(sid) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const path = el.getAttribute("data-nav");
        if (!path) return;

        let targetSid = sid;
        if (el.getAttribute("data-new-session") === "true") {
          targetSid = generateUUID();
          localStorage.setItem(KEY, targetSid);
        }

        const u = new URL(path, location.href);
        const targetPath = u.pathname.toLowerCase();
        const goesToMain = targetPath === "/" || targetPath.endsWith("index.html");

        if (!goesToMain && targetSid) {
          u.searchParams.set("sid", targetSid);
        }
        location.href = u.toString();
      });
    });
  }

  // 8) 인앱 브라우저 대응
  function checkInApp() {
    const ua = navigator.userAgent || "";
    if (/FBAN|FBAV|FB_IAB|FB4A|FBMD|FBSN|FBSS|Facebook|Messenger/i.test(ua)) {
      const bar = document.createElement("div");
      bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:12px;background:#111;color:#fff;display:flex;justify-content:space-between;font-size:13px;";
      bar.innerHTML = `<div><b>인앱 브라우저</b> 권한 제한 주의. 외부 브라우저 권장.</div><button onclick="this.parentElement.remove()" style="color:#fff;background:none;border:none;">닫기</button>`;
      document.body.appendChild(bar);
    }
  }

  // 9) [전역] 새 연구 시작 (onclick="startResearch()")
  window.startResearch = function (isMinor) {
    console.log("[session-guard] 새로운 세션을 생성하고 시작합니다.");
    localStorage.removeItem(KEY);
    const newSid = generateUUID();
    localStorage.setItem(KEY, newSid);

    const u = new URL("step2_consent.html", location.origin); // 다음 페이지 파일명 확인 필요
    u.searchParams.set("sid", newSid);
    if (isMinor) u.searchParams.set("minor", "true");
    location.href = u.toString();
  };

  // 🚀 실행부
  document.addEventListener("DOMContentLoaded", () => {
    // A. 메인 페이지: URL의 SID를 즉시 제거하고 종료 (전파 안 함)
    if (isMainPage) {
      stripSidFromUrl();
      checkInApp();
      console.log("[session-guard] 메인 페이지: URL 정화 완료");
      return;
    }

    // B. 리포트 페이지: URL의 SID 유지 (저장소 보호)
    if (isReportPage) {
      const sid = getSid();
      if (sid) ensureSidInUrl(sid);
      checkInApp();
      console.log("[session-guard] 리포트 페이지: SID 유지 =", sid);
      return;
    }

    // C. 진행 페이지 (Progress): SID 유지 및 모든 링크 전파
    const sid = getSid();
    if (sid) {
      ensureSidInUrl(sid);
      propagateSidToLinks(sid);
      bindNavWithSid(sid);
    }
    checkInApp();
    console.log("[session-guard] 진행 페이지: 세션 전파 중 =", sid);
  });
})();