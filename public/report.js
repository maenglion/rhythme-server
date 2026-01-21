// run only on report pages

// ===== report.js: RUN ONLY ON REPORT PAGES =====
(() => {
  const PATH = (location.pathname || "").toLowerCase();
  const isReportPage =
    PATH.includes("report") ||
    PATH.includes("result") ||
    PATH.includes("analysis-report");

  // 또는 리포트 전용 DOM이 있을 때만 실행(더 안전)
  const hasReportRoot =
    document.getElementById("reportRoot") ||
    document.getElementById("reportContainer") ||
    document.querySelector("[data-page='report']");

  if (!isReportPage && !hasReportRoot) {
    console.debug("[report] skipped on non-report page:", PATH);
    return;
  }

 // ---------------------------
// API helper
// ---------------------------
const DEFAULT_API_BASE = "https://rhythme-server-357918245340.asia-northeast3.run.app";
const API_BASE = (window.RUNTIME_CONFIG?.API_BASE || window.API_BASE || DEFAULT_API_BASE);

function apiUrl(path) {
  const base = API_BASE.endsWith("/") ? API_BASE : API_BASE + "/";
  const clean = String(path || "").replace(/^\//, "");
  return new URL(clean, base).toString();
}

// ---------------------------
// Session helpers
// ---------------------------
function getSidSafe() {
  const urlSid = new URLSearchParams(location.search).get("sid");
  const storeSid = localStorage.getItem("SESSION_ID");
  const sid = urlSid || storeSid || "";
  return sid;
}

function copyText(text) {
  return navigator.clipboard?.writeText(text)
    .catch(() => { prompt("복사해서 사용하세요:", text); });
}

function showModal(title, message, detail = "") {
  if (typeof window.showErrorModal === "function") window.showErrorModal(title, message, detail);
  else alert(`${title}\n\n${message}`);
}

// ---------------------------
// utils
// ---------------------------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const n = (v, d = NaN) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

function median(arr) {
  const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if (!a.length) return NaN;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
}

function getRecordedMs(r) { return n(r.recorded_ms, 0); }
function getPauseMs(r) {
  const pm = n(r.pause_ms, NaN);
  if (Number.isFinite(pm)) return pm;
  const pr = n(r.pause_ratio, NaN);
  const rec = getRecordedMs(r);
  if (Number.isFinite(pr) && rec > 0) return pr * rec;
  return 0;
}
function getSpeechMs(r) { return Math.max(0, getRecordedMs(r) - getPauseMs(r)); }
function getSNR(r) { return n(r.snr_db ?? r.snr_est_db, NaN); }

function fluency2(r) {
  const sr = n(r.speech_rate, NaN);
  const pr = n(r.pause_ratio, NaN);
  const sm = getSpeechMs(r) / 1000; // sec
  if (!Number.isFinite(sr) || !Number.isFinite(pr)) return NaN;
  const f = sr * (1 - pr);
  return f * Math.log(1 + Math.max(0, sm));
}

// ---------------------------
// Gates (분석 가능)
// ---------------------------
// 버튼 클릭 후 2초 소음측정 -> 그 이후 "실발화 >= 10초"가 목표.
// (현재 서버는 2초 offset을 안 주니, v0에서는 stage 기준으로 'speech_ms >= 10초'를 요구)
function isStageEligible(r) {
  return getSpeechMs(r) >= 10_000; // 10s
}

// ---------------------------
// Axis scoring (0~100) - BETA ranges
// ---------------------------
function scoreSpeed(sr) {
  // 대략 3~9 범위를 0~100으로 (데이터 쌓이면 퍼센타일로 교체)
  return Math.round(100 * clamp01((sr - 3.0) / (9.0 - 3.0)));
}

function scoreContinuity(pauseRatio) {
  // pause_ratio 낮을수록 좋음. 0.20~0.60 범위를 100~0으로
  const x = clamp01((pauseRatio - 0.20) / (0.60 - 0.20));
  return Math.round(100 * (1 - x));
}

function scoreRecovery(deltaFluency2) {
  // fluency2 차이 대략 -8~+8 범위를 0~100
  const x = clamp(deltaFluency2, -8, 8);
  return Math.round(100 * ((x + 8) / 16));
}

function scoreStability(fluency2List) {
  const a = fluency2List.filter(Number.isFinite);
  if (a.length < 2) return NaN;
  const mu = a.reduce((s,x)=>s+x,0) / a.length;
  const sd = Math.sqrt(a.reduce((s,x)=>s+(x-mu)*(x-mu),0) / (a.length-1));
  const cv = (mu > 0) ? (sd / mu) : 1;
  // cv 0~0.6 => 100~0
  const x = clamp01(cv / 0.6);
  return Math.round(100 * (1 - x));
}

// Expressiveness는 SQ 제외, trait만
function classifyExpressiveness(density) {
  if (!Number.isFinite(density)) return "표현 특성: 데이터 부족";
  if (density >= 12) return "표현 특성: 연설/대중 발화에 강한 편(강조 전달력↑)";
  if (density <= 8)  return "표현 특성: 정보 압축 전달 성향(톤 변화↓)";
  return "표현 특성: 균형형(정보+강조 균형)";
}

// ---------------------------
// Fetch + normalize server data
// ---------------------------
async function fetchReportData(sid) {
  const url = apiUrl(`/report-data?sid=${encodeURIComponent(sid)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`report-data failed: ${res.status}`);
  return res.json();
}

function findStageArrayDeep(root) {
  const seen = new Set();
  const q = [root];

  while (q.length) {
    const cur = q.shift();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      // stage-like object가 섞여있는 배열이면 그걸 채택
      const ok = cur.length && cur.some(x =>
        x && typeof x === "object" &&
        (("stage_id" in x) || ("stageId" in x) || ("id" in x)) &&
        (("speech_rate" in x) || ("speechRate" in x) || ("pause_ratio" in x) || ("pauseRatio" in x))
      );
      if (ok) return cur;

      // 아니면 배열 원소들 계속 탐색
      for (const x of cur) q.push(x);
    } else {
      for (const k of Object.keys(cur)) q.push(cur[k]);
    }
  }
  return null;
}

function normalizeStages(payload) {
  // 1) 깊게 stage 배열 찾기
  const arr = findStageArrayDeep(payload) || [];

  // 2) 키 매핑 + 값 보정
  const rows = arr.map((r) => {
    const stageIdRaw = r.stage_id ?? r.stageId ?? r.id ?? r.stage ?? null;
    const stage_id = Number(stageIdRaw);

    let recorded_ms = Number(r.recorded_ms ?? r.recordedMs ?? r.recorded ?? r.duration_ms ?? r.durationMs ?? NaN);
    // 혹시 초 단위로 오면(ms로) 보정 (40초면 40)
    if (Number.isFinite(recorded_ms) && recorded_ms > 0 && recorded_ms <= 200) recorded_ms *= 1000;

    let speech_rate = Number(r.speech_rate ?? r.speechRate ?? r.rate ?? NaN);
    // 728 같은 형태면 7.28로 보정
    if (Number.isFinite(speech_rate) && speech_rate > 50) speech_rate /= 100;

    let pause_ratio = Number(r.pause_ratio ?? r.pauseRatio ?? r.pause ?? NaN);
    // 27.1 같은 형태면 0.271로 보정
    if (Number.isFinite(pause_ratio) && pause_ratio > 1.5) pause_ratio /= 100;

    const pitch_sd = Number(r.pitch_sd ?? r.pitchSd ?? r.pitchSD ?? NaN);
    const snr_db = Number(r.snr_db ?? r.snrDb ?? r.snr_est_db ?? r.snrEstDb ?? NaN);

    const pause_ms = Number(r.pause_ms ?? r.pauseMs ?? NaN);

    return {
      stage_id,
      status: r.status,
      recorded_ms,
      speech_rate,
      pause_ratio,
      pitch_sd,
      snr_db,
      pause_ms,
      created_at: r.created_at
    };
  }).filter(r => Number.isFinite(r.stage_id))
    .sort((a,b) => a.stage_id - b.stage_id);

  // 디버그(한 번만 확인)
  console.log("[report_v2] normalizeStages:", {
    topKeys: payload && typeof payload === "object" ? Object.keys(payload) : null,
    rowsLen: rows.length,
    sample: rows[0]
  });

  return rows;
}


// ---------------------------
// Render
// ---------------------------
function setBar(el, score, gray=false) {
  if (!el) return;
  el.classList.toggle("gray", !!gray);
  el.style.width = (Number.isFinite(score) ? `${clamp(score,0,100)}%` : "0%");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function pill(label, cls="off") {
  const s = document.createElement("span");
  s.className = `pill ${cls}`;
  s.textContent = label;
  return s;
}

function renderTable(rows) {
  const tb = document.getElementById("stageTable");
  if (!tb) return;
  tb.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    const speechSec = (getSpeechMs(r) / 1000).toFixed(1);
    tr.innerHTML = `
      <td class="mono">${r.stage_id}</td>
      <td>${r.status || ""}</td>
      <td class="mono">${speechSec}</td>
      <td class="mono">${Number.isFinite(n(r.speech_rate)) ? n(r.speech_rate).toFixed(2) : ""}</td>
      <td class="mono">${Number.isFinite(n(r.pause_ratio)) ? n(r.pause_ratio).toFixed(3) : ""}</td>
      <td class="mono">${Number.isFinite(n(r.pitch_sd)) ? n(r.pitch_sd).toFixed(2) : ""}</td>
      <td class="mono">${Number.isFinite(getSNR(r)) ? getSNR(r).toFixed(1) : ""}</td>
    `;
    tb.appendChild(tr);
  }
}

function computeSQ(stages) {
  const s1 = stages.find(r => r.stage_id === 1) || null;

  const s2 = stages.find(r => r.stage_id === 2) || null;
  const s3 = stages.find(r => r.stage_id === 3) || null;
  const s4 = stages.find(r => r.stage_id === 4) || null;

  const pool = [s2, s3, s4].filter(Boolean);
  const eligiblePool = pool.filter(isStageEligible);

  // 분석 가능 조건: S2~S4 중 2개 이상 10초 충족
  const analyzable = eligiblePool.length >= 2;

  // axis raw
  const srMed = median(eligiblePool.map(r => n(r.speech_rate, NaN)));
  const prMed = median(eligiblePool.map(r => n(r.pause_ratio, NaN)));

  const speed = Number.isFinite(srMed) ? scoreSpeed(srMed) : NaN;
  const cont  = Number.isFinite(prMed) ? scoreContinuity(prMed) : NaN;

  // Recovery: S3 & S4가 둘 다 eligible이면 그걸 우선 사용
  let regRaw = NaN;
  if (s3 && s4 && isStageEligible(s3) && isStageEligible(s4)) {
    regRaw = fluency2(s4) - fluency2(s3);
  } else {
    // 없으면 "후반(있는 stage들의 마지막-첫번째)"로 대체(약하게)
    const sorted = eligiblePool.slice().sort((a,b)=>a.stage_id-b.stage_id);
    if (sorted.length >= 2) regRaw = fluency2(sorted[sorted.length-1]) - fluency2(sorted[0]);
  }
  const reg = Number.isFinite(regRaw) ? scoreRecovery(regRaw) : NaN;

  // Stability
  const fList = eligiblePool.map(fluency2);
  const stab = scoreStability(fList);

  // SQ (BETA)
  const SQ = (Number.isFinite(speed) && Number.isFinite(cont) && Number.isFinite(reg) && Number.isFinite(stab))
    ? Math.round(0.35*speed + 0.35*cont + 0.20*reg + 0.10*stab)
    : NaN;

  // Confidence(신뢰도): eligible stage 수 + 평균 speech_ms 기반
  const avgSpeech = eligiblePool.length
    ? eligiblePool.map(getSpeechMs).reduce((a,b)=>a+b,0) / eligiblePool.length
    : 0;

  let conf = "낮음";
  if (eligiblePool.length >= 3 && avgSpeech >= 15000) conf = "높음";
  else if (eligiblePool.length >= 2 && avgSpeech >= 12000) conf = "보통";

  // Expressiveness trait (참고)
  const densityMed = median(eligiblePool.map(r => {
    const ps = n(r.pitch_sd, NaN);
    const sr = n(r.speech_rate, NaN);
    if (!Number.isFinite(ps) || !Number.isFinite(sr) || sr <= 0) return NaN;
    return ps / sr;
  }));
  const trait = classifyExpressiveness(densityMed);

  // Baseline line (S1 참고)
  let baselineLine = "S1 데이터가 없습니다.";
  if (s1) {
    baselineLine =
      `S1(개인 기준선): 말한시간 ${(getSpeechMs(s1)/1000).toFixed(1)}s · 속도 ${n(s1.speech_rate,NaN).toFixed(2)} · 휴지 ${n(s1.pause_ratio,NaN).toFixed(3)} · SNR ${Number.isFinite(getSNR(s1)) ? getSNR(s1).toFixed(1) : "—"}`;
  }

  return { analyzable, eligibleCount: eligiblePool.length, SQ, speed, cont, reg, stab, regRaw, trait, baselineLine };
}

function renderBadges(stages, sq) {
  const wrap = document.getElementById("badges");
  if (!wrap) return;
  wrap.innerHTML = "";

  // 분석 가능 배지
  wrap.appendChild(
    sq.analyzable ? pill("분석 가능", "ok") : pill("발화량 부족(해석 제한)", "warn")
  );

  // stage eligibility 요약
  wrap.appendChild(pill(`충족 스테이지: ${sq.eligibleCount}/3`, sq.eligibleCount >= 2 ? "ok" : "warn"));

  // 안내(통일 문구)
  const hint = document.getElementById("hintTop");
  if (hint) {
    hint.textContent = "버튼을 누르면 2초 소음 측정 후 녹음이 시작됩니다. 2초 뒤부터 최소 10초 이상 말해 주세요.";
  }
}

function grayOutAxes() {
  setText("sqScore", "—");
  setText("sqConfidence", "—");
  setText("sqDesc", "발화량이 부족하여(2초 이후 기준) 이번 결과는 해석이 제한됩니다. 다시 시도해 주세요.");
  setBar(document.getElementById("axSpeed"), 100, true);
  setBar(document.getElementById("axCont"), 100, true);
  setBar(document.getElementById("axReg"), 100, true);
  setBar(document.getElementById("axStab"), 100, true);
  setText("axSpeedV", "—"); setText("axContV", "—"); setText("axRegV", "—"); setText("axStabV", "—");
  setText("axSpeedT", ""); setText("axContT", ""); setText("axRegT", ""); setText("axStabT", "");
}

function renderAxesAndSQ(sq) {
  if (!sq.analyzable || !Number.isFinite(sq.SQ)) {
    grayOutAxes();
    return;
  }

  setText("sqScore", String(sq.SQ));
  setText("sqConfidence", sq.eligibleCount >= 3 ? "높음" : "보통");
  setText("sqDesc", "SQ(BETA)는 S2~S4의 속도·끊김·유창성 회복·일관성을 합성한 ‘음성 체계화 지수’입니다.");

  setBar(document.getElementById("axSpeed"), sq.speed);
  setBar(document.getElementById("axCont"), sq.cont);
  setBar(document.getElementById("axReg"), sq.reg);
  setBar(document.getElementById("axStab"), sq.stab);

  setText("axSpeedV", `${sq.speed}/100`);
  setText("axContV", `${sq.cont}/100`);
  setText("axRegV", `${sq.reg}/100`);
  setText("axStabV", `${sq.stab}/100`);

  setText("axSpeedT", "말하기 처리/산출 속도(높을수록 빠름)");
  setText("axContT", "끊김 제어(휴지가 적고 흐름이 유지될수록 높음)");
  setText("axRegT", "유창성 기반 회복(속도+끊김+발화량이 함께 좋아지는지)");
  setText("axStabT", "스테이지 간 출력 페이스 일관성");

  setText("traitLine", sq.trait);
}

function setupCTA() {
  const btn = document.getElementById("btnStartTest");
  if (btn) {
    btn.onclick = () => {
      // 새 테스트: sid 제거하고 index로
      const u = new URL("./index.html", location.href);
      location.href = u.toString();
    };
  }

  // 끝까지 읽으면(공유 받은 사람) 모달 1회
  const sentinel = document.getElementById("endSentinel");
  if (!sentinel) return;

  const obs = new IntersectionObserver((entries) => {
    if (sessionStorage.getItem("rh_cta_shown")) return;
    if (entries.some(e => e.isIntersecting)) {
      sessionStorage.setItem("rh_cta_shown", "1");
      showModal(
        "나도 테스트 해볼까요?",
        "버튼을 누르면 2초 소음 측정 후 녹음이 시작돼요.\n2초 뒤부터 최소 10초 이상 말해 주세요.",
        ""
      );
    }
  }, { threshold: 0.2 });

  obs.observe(sentinel);
}

// ---------------------------
// init
// ---------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const sid = getSidSafe();
  setText("sidText", sid ? sid : "세션 없음");

  const btnCopySid = document.getElementById("btnCopySid");
  if (btnCopySid) btnCopySid.onclick = () => copyText(sid || "");

  const btnCopyLink = document.getElementById("btnCopyLink");
  if (btnCopyLink) {
    btnCopyLink.onclick = () => {
      const u = new URL(location.href);
      // 결과 공유는 sid 포함이 맞음
      copyText(u.toString());
    };
  }

  setupCTA();

  if (!sid) {
    renderBadges([], { analyzable:false, eligibleCount:0 });
    grayOutAxes();
    showModal("세션이 없어요", "링크가 잘못되었거나 세션이 만료되었어요.", "");
    return;
  }

  try {
    const payload = await fetchReportData(sid);
    const stages = normalizeStages(payload);

    renderTable(stages);

    const sq = computeSQ(stages);
    renderBadges(stages, sq);
    setText("baselineLine", sq.baselineLine);

    // 발화 부족이면 안내 모달(진행은 막지 않지만 해석은 숨김)
    if (!sq.analyzable) {
      showModal(
        "발화량이 부족해요",
        "버튼을 누르면 2초 소음 측정 후 녹음이 시작됩니다.\n2초 뒤부터 각 스테이지 최소 10초 이상 말해 주세요.",
        "SQ/4축은 발화량 충족 시 산출됩니다."
      );
    }

    renderAxesAndSQ(sq);

  } catch (e) {
    console.error(e);
    renderBadges([], { analyzable:false, eligibleCount:0 });
    grayOutAxes();
    showModal("리포트를 불러오지 못했어요", "네트워크 또는 서버 오류입니다.", String(e?.message || e));
  }
});
function showOkModal(title, message) {
  // 성공 알림도 모달로
  if (typeof window.showErrorModal === "function") {
    window.showErrorModal(title, message, "");
  } else if (typeof window.showModal === "function") {
    window.showModal(`${title}\n\n${message}`);
  } else {
    alert(`${title}\n\n${message}`);
  }
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback
    try {
      prompt("복사해서 붙여넣기:", text);
      return true;
    } catch {
      return false;
    }
  }
}

function getSidForReport() {
  return (
    new URLSearchParams(location.search).get("sid") ||
    localStorage.getItem("SESSION_ID") ||
    localStorage.getItem("rhythmi_session_id") ||
    window.SESSION_ID ||
    ""
  );
}

function setupReportCopyUI() {
  const sid = getSidForReport();

  // 1) Session ID 표시
  const sidEl = document.getElementById("displaySessionId");
  if (sidEl) sidEl.textContent = sid ? `Session ID: ${sid}` : "Session ID: 없음";

  // 2) 세션 ID 복사 버튼
  const btnCopySession = document.getElementById("btnCopySession");
  if (btnCopySession) {
    btnCopySession.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!sid) {
        showOkModal("세션 ID가 없어요", "리포트를 다시 열어 주세요.");
        return;
      }
      const ok = await copyTextToClipboard(sid);
      if (ok) showOkModal("복사 완료", "세션 ID가 클립보드에 복사되었습니다.");
      else showOkModal("복사 실패", "브라우저 권한 문제일 수 있어요. 수동으로 복사해 주세요.");
    });
  }

  // 3) 결과 링크 복사 버튼 (id는 둘 중 하나를 잡음)
  const btnCopyLink =
    document.getElementById("btnCopyReportLink") || document.getElementById("copyReportLinkBtn");

  if (btnCopyLink) {
    btnCopyLink.addEventListener("click", async (e) => {
      e.preventDefault();

      // ✅ report 링크는 sid가 있어야 열림 → 현재 URL(=sid 포함)을 그대로 복사
      const url = location.href;

      const ok = await copyTextToClipboard(url);
      if (ok) showOkModal("복사 완료", "결과 링크가 클립보드에 복사되었습니다.");
      else showOkModal("복사 실패", "브라우저 권한 문제일 수 있어요. 수동으로 복사해 주세요.");
    });
  }
}

document.addEventListener("DOMContentLoaded", setupReportCopyUI);
})();