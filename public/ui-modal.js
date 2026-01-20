// ui-modal.js
(function () {
  // 이미 있으면 덮어쓰지 않음 (index/다른 페이지랑 안 엮이게)
  if (window.showErrorModal) return;

  window.showErrorModal = function (title, message, detail) {
    const id = "rhythmeErrorModal";
    let modal = document.getElementById(id);

    if (!modal) {
      modal = document.createElement("div");
      modal.id = id;
      modal.style.cssText = `
        position:fixed; inset:0; z-index:999999;
        background:rgba(0,0,0,.55);
        display:flex; align-items:center; justify-content:center;
        padding:18px;
      `;
      modal.innerHTML = `
        <div style="
          width:min(520px, 92vw);
          background:#111827; color:#fff;
          border:1px solid rgba(255,255,255,.12);
          border-radius:16px; padding:16px;
          box-shadow:0 18px 60px rgba(0,0,0,.45);
          font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        ">
          <div style="font-weight:800; font-size:16px; margin-bottom:8px;" id="rhErrTitle"></div>
          <div style="font-size:14px; line-height:1.4; opacity:.95;" id="rhErrMsg"></div>
          <pre style="
            margin-top:10px; padding:10px;
            background:rgba(255,255,255,.06);
            border-radius:12px; overflow:auto;
            font-size:12px; opacity:.9; display:none;
          " id="rhErrDetail"></pre>
          <div style="display:flex; justify-content:flex-end; margin-top:12px;">
            <button id="rhErrClose" style="
              padding:10px 14px; border-radius:12px;
              border:1px solid rgba(255,255,255,.16);
              background:transparent; color:#fff; font-weight:700;
              cursor:pointer;
            ">확인</button>
          </div>
        </div>
      `;
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
      });
      document.body.appendChild(modal);
      modal.querySelector("#rhErrClose").onclick = () => modal.remove();
    }

    modal.querySelector("#rhErrTitle").textContent = title || "오류";
    modal.querySelector("#rhErrMsg").textContent = message || "오류가 발생했습니다.";

    const d = modal.querySelector("#rhErrDetail");
    if (detail) {
      d.style.display = "block";
      d.textContent = detail;
    } else {
      d.style.display = "none";
      d.textContent = "";
    }
  };
})();
window.showInfoModal = function (title, message, detail = "") {
  if (typeof window.showErrorModal === "function") {
    window.showErrorModal(title, message, detail);
    return;
  }
  if (typeof window.showModal === "function") {
    window.showModal(`${title}\n\n${message}${detail ? `\n\n${detail}` : ""}`);
    return;
  }
  console.log(title, message, detail);
};

