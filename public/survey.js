(() => {
  const STORAGE_SID_KEY = "SESSION_ID";

  // ✅ 네가 준 구글폼 주소(폼 고유 URL)
  const FORM_BASE =
    "https://docs.google.com/forms/d/e/1FAIpQLSdYVDquseww9O3hvJgRyYmlZxT0BhZ5e_gxmG8mgFWAbx3a4Q/viewform";

  function getSid() {
    return (
      new URLSearchParams(location.search).get("sid") ||
      localStorage.getItem(STORAGE_SID_KEY)
    );
  }

  // ✅ 네가 준 URL을 그대로 “재구성” (값만 바꿔 끼울 수 있게)
  function buildGoogleFormUrl({ sid, s1 = 5, s2 = 5, s3 = 5 }) {
    const u = new URL(FORM_BASE);
    u.searchParams.set("usp", "pp_url");

    // entry.1445339256 = 네 링크에서 2535125D25 들어가던 칸 (세션ID로 쓰는 게 자연스러움)
    u.searchParams.set("entry.1445339256", sid);

    // 네 링크의 5/5/5 (필요하면 로컬스토리지 값으로 바꿔도 됨)
    u.searchParams.set("entry.1985214579", String(s1));
    u.searchParams.set("entry.2046519166", String(s2));
    u.searchParams.set("entry.666410266", String(s3));

    // ✅ 체크박스/복수선택은 같은 entry 키를 "여러 번 append" 해야 함 (네 링크가 이 구조임)
    u.searchParams.append("entry.293321030", "SQ(체계화)");
    u.searchParams.append("entry.293321030", "음성 (프로소디)");

    u.searchParams.append("entry.2110754268", "SQ 해석을 더 상세히");
    u.searchParams.append("entry.2110754268", "그래프 / 시각화 강화");

    u.searchParams.set("entry.1674818339", "없음");

    return u.toString();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const sid = getSid();
    if (!sid) {
      alert("세션이 없습니다. 처음부터 다시 진행해주세요.");
      location.href = "./index.html";
      return;
    }

    localStorage.setItem(STORAGE_SID_KEY, sid);

    const el = document.getElementById("sessionId");
    if (el) el.value = sid;

    const btn = document.getElementById("btnStartSurvey");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const url = buildGoogleFormUrl({ sid });

      // 같은 탭 이동
      location.href = url;

      // 새 탭이 필요하면 이걸로:
      // window.open(url, "_blank", "noopener,noreferrer");
    });
  });
})();
