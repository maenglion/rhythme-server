// session-guard.js (MVP 최소/안전 버전)
(function () {
  const KEY = "SESSION_ID";

  function getSid() {
    const urlSid = new URLSearchParams(location.search).get("sid");
    const storeSid = localStorage.getItem(KEY);
    const winSid = window.SESSION_ID;
    return urlSid || storeSid || winSid || null;
  }

  function ensureSidInUrl(sid) {
    if (!sid) return null;

    const u = new URL(location.href);
    if (!u.searchParams.get("sid")) {
      u.searchParams.set("sid", sid);
      history.replaceState(null, "", u.toString());
    }
    localStorage.setItem(KEY, sid);
    window.SESSION_ID = sid;
    return sid;
  }

  // 전역 제공 (필요하면 쓰고, 안 써도 됨)
  window.getSid = getSid;

  document.addEventListener("DOMContentLoaded", () => {
    const sid = getSid();
    if (!sid) return; // 여기서 리다이렉트까지는 안 함(너 방식 존중)
    ensureSidInUrl(sid);
  });
})();
