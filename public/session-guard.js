// session-guard.js
(function () {
  const KEY = "SESSION_ID";

  function getSid() {
    return new URLSearchParams(location.search).get("sid") || localStorage.getItem(KEY);
  }

  function ensureSidInUrl(sid) {
    if (!sid) return;
    const u = new URL(location.href);
    if (!u.searchParams.get("sid")) {
      u.searchParams.set("sid", sid);
      history.replaceState(null, "", u.toString());
    }
    localStorage.setItem(KEY, sid);
  }

  // 같은 사이트 링크(<a>)에 sid 자동 전파
  function propagateSidToLinks(sid) {
    if (!sid) return;
    document.querySelectorAll("a[href]").forEach((a) => {
      try {
        const href = a.getAttribute("href");
        if (!href || /^(javascript:|mailto:|tel:)/i.test(href)) return;

        const u = new URL(href, location.href);
        if (u.origin === location.origin && !u.searchParams.get("sid")) {
          u.searchParams.set("sid", sid);
          a.setAttribute("href", u.toString());
        }
      } catch {}
    });
  }

  // ✅ 버튼/링크에 data-nav 달면 sid 붙여서 이동
  function bindNavWithSid(sid) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const path = el.getAttribute("data-nav");
        if (!path) return;

        if (!sid) {
          alert("세션이 없습니다. 처음부터 다시 진행해주세요.");
          location.href = "./index.html";
          return;
        }
        const u = new URL(path, location.href);
        u.searchParams.set("sid", sid);
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

  document.addEventListener("DOMContentLoaded", () => {
    const sid = getSid();
    ensureSidInUrl(sid);
    propagateSidToLinks(sid);
    bindNavWithSid(sid);

    if (isFacebookOrMessengerInApp()) showInAppWarningBar();

    console.log("[session-guard] sid =", sid);
  });
})();
