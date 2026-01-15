// session-guard.js (개선 버전)
(function () {
  const KEY = "SESSION_ID";

  // ✅ 1. 고유한 UUID 생성 함수 (표준 방식)
  function generateUUID() {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  // ✅ 2. 세션 아이디 가져오기 (로직 수정)
  function getSid() {
    const urlParams = new URLSearchParams(location.search);
    const urlSid = urlParams.get("sid");
    const storedSid = localStorage.getItem(KEY);

    // 메인 페이지(index) 진입 시 URL에 sid가 없다면 무조건 새로 생성하여 
    // 이전 사용자의 데이터가 남지 않도록 합니다.
    const isMainPage = location.pathname.endsWith("index.html") || location.pathname === "/";
    
    if (isMainPage && !urlSid) {
      const newSid = generateUUID();
      console.log("[session-guard] 새로운 세션 생성:", newSid);
      return newSid;
    }

    return urlSid || storedSid || generateUUID();
  }

  function ensureSidInUrl(sid) {
    if (!sid) return;
    const u = new URL(location.href);
    if (u.searchParams.get("sid") !== sid) {
      u.searchParams.set("sid", sid);
      history.replaceState(null, "", u.toString());
    }
    localStorage.setItem(KEY, sid);
  }

  function propagateSidToLinks(sid) {
    if (!sid) return;
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(href)) return;

        const u = new URL(href, location.href);
        // 내 사이트 링크에만 sid 전파
        if (u.origin === location.origin) {
          u.searchParams.set("sid", sid);
          a.setAttribute("href", u.toString());
        }
      } catch {}
    });
  }

// ✅ [추가] 새로운 연구 참여 시 세션을 초기화하고 생성하는 함수
  window.startResearch = function(isMinor) {
    console.log("[session-guard] 새로운 연구 참여 시작. 기존 세션 초기화.");

    // 1. 기존 세션 정보 완전 삭제
    localStorage.removeItem(KEY);

    // 2. 새로운 고유 SID 생성
    const newSid = (typeof crypto.randomUUID === 'function') 
      ? crypto.randomUUID() 
      : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );

    // 3. 새 세션 저장
    localStorage.setItem(KEY, newSid);

    // 4. 다음 페이지로 이동 (파일명은 실제 프로젝트에 맞게 수정하세요)
    const nextPath = "step2_consent.html"; 
    const u = new URL(nextPath, location.href);
    u.searchParams.set("sid", newSid);
    
    if (isMinor) u.searchParams.set("minor", "true");

    console.log("[session-guard] 새 세션으로 이동:", u.toString());
    location.href = u.toString();
  };


  
  // ✅ 버튼/링크에 data-nav 달면 sid 붙여서 이동
// ✅ 3. 네비게이션 로직 개선 (새 세션 시작 기능 추가)
  function bindNavWithSid(sid) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        let targetSid = sid;
        
        // 만약 버튼에 data-new-session="true"가 있다면 세션 새로 생성
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
  // FB / Messenger 인앱 감지
  function isFacebookOrMessengerInApp() {
    const ua = navigator.userAgent || "";
    return /FBAN|FBAV|FB_IAB|FB4A|FBMD|FBSN|FBSS|Facebook|Messenger/i.test(ua);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function chromeIntentUrl(currentUrl) {
    const u = new URL(currentUrl);
    const scheme = u.protocol.replace(":", "");
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  }

  function showInAppWarningBar() {
    const bar = document.createElement("div");
    bar.id = "inapp-warning-bar";
    bar.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      "bottom:0",
      "z-index:99999",
      "padding:12px 12px",
      "background:#111",
      "color:#fff",
      "font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial",
      "font-size:13px",
      "line-height:1.4",
      "box-shadow:0 -6px 24px rgba(0,0,0,.25)",
      "display:flex",
      "gap:10px",
      "align-items:center",
      "justify-content:space-between",
      "flex-wrap:wrap",
    ].join(";");

    bar.innerHTML = `
      <div style="max-width:70ch;">
        <b>Facebook/메신저 내장 브라우저</b>에서는 <b>입력/권한</b>이 막힐 수 있어요.<br/>
        가능하면 <b>카톡</b>에서 진행하거나, 아래 버튼으로 <b>외부 브라우저</b>로 열어주세요.
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button id="openExternal" type="button"
          style="padding:10px 12px;border-radius:10px;border:1px solid #555;background:#fff;color:#111;cursor:pointer;">
          외부 브라우저로 열기
        </button>
        <button id="copyLink" type="button"
          style="padding:10px 12px;border-radius:10px;border:1px solid #555;background:transparent;color:#fff;cursor:pointer;">
          링크 복사
        </button>
        <button id="closeBar" type="button"
          style="padding:10px 10px;border-radius:10px;border:1px solid #333;background:transparent;color:#aaa;cursor:pointer;">
          닫기
        </button>
      </div>
    `;

    document.body.appendChild(bar);
    const url = location.href;

    bar.querySelector("#openExternal")?.addEventListener("click", () => {
      if (isAndroid()) {
        location.href = chromeIntentUrl(url);
      } else {
        alert("iPhone: 오른쪽 메뉴(⋯)에서 ‘Safari에서 열기’로 진행해줘.");
      }
    });

    bar.querySelector("#copyLink")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        alert("링크를 복사했어요. 외부 브라우저에 붙여넣어 열어주세요.");
      } catch {
        prompt("아래 링크를 복사해서 브라우저에 붙여넣어 주세요:", url);
      }
    });

    bar.querySelector("#closeBar")?.addEventListener("click", () => bar.remove());
  }

  // ✅ UUID 생성 함수 추가
function generateUUID() {
  return crypto.randomUUID(); // 최신 브라우저 지원
}

// ✅ 기존 getSid 수정
function getSid() {
  const urlParams = new URLSearchParams(location.search);
  const urlSid = urlParams.get("sid");

  // 만약 현재 페이지가 '메인'이거나 '검사 시작' 페이지라면 새로운 SID 부여
  const isStartPage = location.pathname.includes("index.html") || location.pathname === "/";
  
  if (isStartPage && !urlSid) {
    const newSid = generateUUID();
    localStorage.setItem(KEY, newSid);
    return newSid;
  }

  return urlSid || localStorage.getItem(KEY);
}

  document.addEventListener("DOMContentLoaded", () => {
    const sid = getSid();
    ensureSidInUrl(sid);
    propagateSidToLinks(sid);
    bindNavWithSid(sid);

    if (isFacebookOrMessengerInApp()) showInAppWarningBar();

    console.log("[session-guard] sid =", sid);
  });
})();
