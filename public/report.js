// report.js (no module)
(function () {
  const CLOUD_RUN_URL = "https://rhythme-server-as3ud42lpa-du.a.run.app";
  const apiUrl = (path) => `${CLOUD_RUN_URL.replace(/\/$/, "")}${path}`;

  const $ = (id) => document.getElementById(id);

  function getSidSafe() {
    // session-guard.js가 있으면 그걸 우선
    const sid = window.getSid?.() ||
      new URLSearchParams(location.search).get("sid") ||
      localStorage.getItem("SESSION_ID") ||
      window.SESSION_ID ||
      null;

    if (!sid) {
      alert("세션이 없습니다. 처음부터 다시 진행해주세요.");
      location.href = "./index.html";
      return null;
    }
    return sid;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("복사했습니다.");
    } catch {
      prompt("복사해서 사용하세요:", text);
    }
  }

  function fmt(n, digits = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    return Number(n).toFixed(digits);
  }

  function setBadge(el, text, kind) {
    el.textContent = text;
    el.classList.remove("good", "warn", "bad", "primary");
    if (kind) el.classList.add(kind);
  }

  function qualityFrom(stages) {
    // 간단 룰: 평균 SNR, max clip, 완료율
    const okStages = stages.filter(s => s.status === "completed");
    const completeRatio = okStages.length / Math.max(1, stages.length);

    const snrs = stages.map(s => s.snr_est_db).filter(v => typeof v === "number");
    const avgSnr = snrs.length ? snrs.reduce((a,b)=>a+b,0)/snrs.length : null;

    const clips = stages.map(s => s.clipping_ratio).filter(v => typeof v === "number");
    const maxClip = clips.length ? Math.max(...clips) : null;

    const hasBad = stages.some(s => s.quality_flag && s.quality_flag !== "ok");

    // 등급
    if (completeRatio < 1) return { label: "낮음(미완료)", kind: "bad", avgSnr, maxClip };
    if (hasBad) return { label: "주의(품질 경고)", kind: "warn", avgSnr, maxClip };
    if (avgSnr !== null && avgSnr < 15) return { label: "낮음(소음)", kind: "bad", avgSnr, maxClip };
    if (maxClip !== null && maxClip > 0.02) return { label: "주의(클리핑)", kind: "warn", avgSnr, maxClip };
    return { label: "좋음", kind: "good", avgSnr, maxClip };
  }

  function hasBaseline(stages) {
    return stages.some(s => s.stage_id === 1 && s.status === "completed" && (s.recorded_ms ?? 0) >= 36000);
  }

  function buildPersona(stages, survey, qeeg) {
    // 초간단 휴먼 요약 (MVP)
    const b = stages.find(s => s.stage_id === 1) || stages[0];
    const s2 = stages.find(s => s.stage_id === 2);
    const s3 = stages.find(s => s.stage_id === 3);
    const s4 = stages.find(s => s.stage_id === 4);

    const sr = b?.speech_rate;
    const pr = b?.pause_ratio;
    const psd = b?.pitch_sd;

    let title = "데이터 기반 요약(초안)";
    let summaryParts = [];

    if (typeof sr === "number") {
      if (sr >= 7.5) summaryParts.push("발화 속도가 빠른 편입니다.");
      else if (sr <= 5.5) summaryParts.push("발화 속도가 느린 편입니다.");
      else summaryParts.push("발화 속도가 안정적인 편입니다.");
    }

    if (typeof pr === "number") {
      if (pr >= 0.35) summaryParts.push("휴지가 비교적 많아 ‘정리하며 말하기’ 경향이 보입니다.");
      else if (pr <= 0.20) summaryParts.push("휴지가 적어 ‘연결해서 말하기’ 경향이 보입니다.");
      else summaryParts.push("휴지 비율이 균형적입니다.");
    }

    if (s3 && b && typeof s3.pause_ratio === "number" && typeof b.pause_ratio === "number") {
      const d = s3.pause_ratio - b.pause_ratio;
      if (d > 0.06) summaryParts.push("혼란/변수 상황에서 휴지가 늘어나는 패턴이 관찰됩니다.");
    }

    if (survey?.total_score != null) {
      summaryParts.push(`설문(SQ) 점수: ${Math.round(survey.total_score)}점(${survey.s_tag || "SQ"}).`);
    } else {
      summaryParts.push("설문 데이터가 없거나 연결되지 않았습니다.");
    }

    if ((qeeg?.upload_cnt || 0) > 0) summaryParts.push("qEEG 업로드가 있어 ‘뇌파-음성’ 가설 섹션이 추가됩니다.");
    else summaryParts.push("qEEG 미업로드로 뇌파 기반 섹션은 생략됩니다.");

    return {
      title,
      summary: summaryParts.join(" ")
    };
  }

  function buildMatrix(stages, survey, qeeg) {
    const baselineOk = hasBaseline(stages);
    const rows = [];

    // 축 1) 인지적 정밀도
    rows.push({
      axis: "인지적 정밀도",
      evidence: baselineOk ? "Baseline 대비 휴지/속도 변화(Δ)" : "절대 지표(참고)",
      meaning: baselineOk
        ? "기준(읽기) 대비 말하기 단계에서 리듬/휴지 변화가 얼마나 안정적인지로 ‘정밀도’를 추정합니다."
        : "Baseline이 없어 변화량 기반 해석은 제한됩니다. (참고용)"
    });

    // 축 2) 에너지 몰입도
    rows.push({
      axis: "에너지 몰입도",
      evidence: "Pitch SD / Speech Rate",
      meaning: "특정 스테이지에서 억양 변동(Pitch SD)이나 속도가 상승하면 몰입/흥분 반응 가능성을 시사합니다."
    });

    // 축 3) 회복 탄력성
    rows.push({
      axis: "회복 탄력성",
      evidence: "Stage3→Stage4 리듬 복구",
      meaning: "변수/스트레스(3) 이후 공감/정리(4)에서 리듬이 얼마나 회복되는지 관찰합니다."
    });

    // qEEG
    rows.push({
      axis: "qEEG-음성(가설)",
      evidence: (qeeg?.upload_cnt || 0) > 0 ? "대역파워/비대칭/EC-EO" : "미제공",
      meaning: (qeeg?.upload_cnt || 0) > 0
        ? "음성 지표와 뇌파 패턴의 동반 변화를 연구적으로 탐색합니다(베타)."
        : "qEEG가 없어서 해당 분석은 생략됩니다."
    });

    // survey
    rows.push({
      axis: "설문↔음성 일치도",
      evidence: survey?.total_score != null ? "SQ 점수 + 음성 패턴" : "설문 없음",
      meaning: "자기보고와 음성 패턴이 얼마나 같은 방향인지로 Confidence를 산출합니다(초안)."
    });

    return rows;
  }

  function renderStageTable(stages) {
    const body = $("stageTableBody");
    body.innerHTML = "";

    stages.sort((a,b)=>a.stage_id-b.stage_id).forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.stage_id}</td>
        <td>${s.status || "-"}</td>
        <td>${fmt(s.speech_rate, 2)}</td>
        <td>${fmt(s.pause_ratio, 3)}</td>
        <td>${fmt(s.pitch_sd, 2)}</td>
        <td>${fmt(s.snr_est_db, 1)}</td>
        <td>${fmt(s.clipping_ratio, 4)}</td>
      `;
      body.appendChild(tr);
    });

    if (!stages.length) {
      body.innerHTML = `<tr><td colspan="7" class="muted">데이터가 없습니다.</td></tr>`;
    }
  }

  function renderMatrix(rows) {
    const body = $("matrixBody");
    body.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${r.axis}</b></td>
        <td class="muted">${r.evidence}</td>
        <td>${r.meaning}</td>
      `;
      body.appendChild(tr);
    });
  }

  function drawChart(stages) {
    const canvas = $("chart");
    const ctx = canvas.getContext("2d");

    // devicePixelRatio 대응
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, cssW, cssH);

    const data = stages.slice().sort((a,b)=>a.stage_id-b.stage_id);
    const xs = data.map(d => d.stage_id);

    const series = [
      { key: "speech_rate", label: "Speech Rate" },
      { key: "pause_ratio", label: "Pause Ratio" },
      { key: "pitch_sd",    label: "Pitch SD" },
    ];

    // normalize 각각 그려도 되지만 MVP로는 한 그래프에 “상대 스케일(0~1)”로 합쳐서 보여줌
    function norm(arr) {
      const vals = arr.filter(v => typeof v === "number");
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return arr.map(v => (typeof v === "number" && max > min) ? (v - min) / (max - min) : 0.5);
    }

    const sr = norm(data.map(d=>d.speech_rate));
    const pr = norm(data.map(d=>d.pause_ratio));
    const ps = norm(data.map(d=>d.pitch_sd));

    const norms = [sr, pr, ps];
    const labels = series.map(s=>s.label);

    // axes
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, cssH-20);
    ctx.lineTo(cssW-10, cssH-20);
    ctx.stroke();

    // x points
    const left = 40, right = cssW - 12;
    const top = 12, bottom = cssH - 28;
    const n = data.length;
    const xAt = (i) => (n === 1) ? (left + right) / 2 : left + (right-left) * (i/(n-1));
    const yAt = (t) => bottom - (bottom-top) * t;

    // draw 3 lines (색 지정 안 하려 했는데 구분은 필요해서 alpha/대시로 구분)
    const styles = [
      { dash: [], alpha: 0.95 },
      { dash: [6,4], alpha: 0.85 },
      { dash: [2,4], alpha: 0.85 },
    ];

    norms.forEach((arr, si) => {
      ctx.setLineDash(styles[si].dash);
      ctx.globalAlpha = styles[si].alpha;
      ctx.strokeStyle = "rgba(187,134,252,0.9)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      arr.forEach((v, i) => {
        const x = xAt(i);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // x labels
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "12px system-ui";
    data.forEach((d, i) => {
      ctx.fillText(`S${d.stage_id}`, xAt(i)-10, cssH-8);
    });

    $("chartLegend").textContent = `그래프는 상대 스케일(0~1)로 표시됩니다: ${labels.join(" / ")}`;
  }

  // report.js

async function fetchReportData(sid) {
  if (!sid) throw new Error("sid is empty");

  // 1) query 방식 먼저, 2) path 방식 fallback
  const urls = [
    apiUrl("/report-data") + "?sid=" + encodeURIComponent(sid),
    apiUrl("/report-data/" + encodeURIComponent(sid)),
  ];

  let lastText = "";

  for (const url of urls) {
    console.log("[report] fetchReportData ->", url);

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      return await res.json();
    }

    lastText = await res.text().catch(() => "");
    // ✅ 404면 다음 URL 시도
    if (res.status === 404) continue;

    // ✅ 404 말고 다른 에러는 즉시 터뜨림
    throw new Error(`report-data failed ${res.status}: ${lastText} (url=${url})`);
  }

  // 둘 다 404였던 경우
  throw new Error(`report-data failed 404 on both endpoints. last=${lastText}`);
}



function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 1200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // 폴백 (보안 컨텍스트 이슈 등)
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showToast("세션 ID가 복사됐어요");
}


  async function init() {
    const sid = getSidSafe();
    if (!sid) return;

    $("sidText").textContent = sid;

const copySidBtn = $("copySidBtn");
if (copySidBtn) copySidBtn.onclick = () => copyText(sid);

// 링크 복사 버튼은 HTML에서 제거했으면 JS도 스킵
const copyLinkBtn = $("copyLinkBtn");
if (copyLinkBtn) copyLinkBtn.onclick = () => copyText(location.href);

    try {
      const data = await fetchReportData(sid);
      window.__reportData = data; 
      // 기대 JSON 형태:
      // {
      //   generated_at: "...",
      //   age: 20,
      //   survey: {...} | null,
      //   qeeg: { upload_cnt: 0|2, ... },
      //   voice: { stages: [ {stage_id,...} ], summary: {all_ok, not_ok_cnt, ...} }
      // }

      const stamp = data.submitted_at ?? data.generated_at ?? "-";
$("generatedAt").textContent =
  stamp === "-" ? "리포트 생성일: -" : `리포트 생성일: ${new Date(stamp).toLocaleString("ko-KR")}`;


      const age = Number(data.age || 0);
      if (age > 0 && age < 14) $("under14Note").style.display = "block";

      const stages = data?.voice?.stages || [];
      renderStageTable(stages);

      const q = qualityFrom(stages);
      setBadge($("qualityBadge"), `품질: ${q.label}`, q.kind);

      const baselineOk = hasBaseline(stages);
      setBadge($("baselineBadge"), baselineOk ? "Baseline: 있음" : "Baseline: 없음", baselineOk ? "good" : "warn");

function buildPersona(stages, survey, qeeg) {
    if (!stages || stages.length < 2) return { title: "데이터 수집 중", summary: "분석을 위한 충분한 세션 데이터가 아직 확보되지 않았습니다." };

    const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    const b = sorted.find(s => s.stage_id === 1) || sorted[0];
    const last = sorted[sorted.length - 1];

    // 복합 지표 산출
    const dSr = last.speech_rate - b.speech_rate; 
    const dPr = last.pause_ratio - b.pause_ratio; 
    const energyDensity = last.pitch_sd / (last.speech_rate || 1);

    let title = "안정적 데이터 흐름";
    let summaryParts = [];

    // 전문적 해석 로직
    if (dSr > 0.05 && dPr < 0) {
      title = "인지적 가속 및 적응형";
      summaryParts.push("과제 후반부로 갈수록 발화의 효율성이 높아지며 인지적 부하에 능숙하게 적응하는 양상이 관찰됩니다.");
    } else {
      title = "신중한 정보 처리형";
      summaryParts.push("일정한 리듬을 유지하며 정보를 신중하게 구조화하여 전달하는 패턴을 보입니다.");
    }

    if (energyDensity > 8.5) {
      summaryParts.push(`에너지 밀도(${energyDensity.toFixed(1)})가 높아 단순 전달을 넘어 메시지에 강조와 생동감을 더하는 능력이 탁월합니다.`);
    }

    if (survey?.total_score > 70) {
      summaryParts.push("자기보고식 심리 지표와 음성 데이터의 활력 지수가 높은 일치율을 보입니다.");
    }

    return { title, summary: summaryParts.join(" ") };
  }

  // 인덱스 카드 값 업데이트 함수
  function updateIndexCards(stages) {
    if (stages.length < 2) return;
    const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    const b = sorted[0];
    const last = sorted[sorted.length - 1];
    
    // 1. 인지 적응도 (Pause가 얼마나 줄었는가)
    const adaptive = (b.pause_ratio - last.pause_ratio) > 0.02 ? "높음" : "보통";
    $("index-adaptive").textContent = adaptive;

    // 2. 에너지 밀도 (Pitch SD / Rate)
    const densityVal = last.pitch_sd / (last.speech_rate || 1);
    $("index-energy").textContent = densityVal > 9 ? "우수" : (densityVal > 7 ? "양호" : "보통");

    // 3. 회복 탄력성 (S3 Stress -> S4 Recovery 추이)
    const s3 = sorted.find(s => s.stage_id === 3);
    const s4 = sorted.find(s => s.stage_id === 4);
    if (s3 && s4) {
      const resVal = s4.speech_rate - s3.speech_rate;
      $("index-resilience").textContent = resVal >= 0 ? "안정" : "관찰";
    }
  }

  async function init() {
    const sid = getSidSafe();
    if (!sid) return;

    $("sidText").textContent = sid; // 실제 값은 숨겨진 span에 저장
    $("copySidBtn").onclick = () => copyText(sid);

    try {
      const data = await fetchReportData(sid);
      const stages = data?.voice?.stages || [];

      // 1. 리포트 헤더 및 카드 업데이트
      const stamp = data.submitted_at ?? data.generated_at ?? "-";
      $("generatedAt").textContent = stamp === "-" ? "생성일: -" : `리포트 생성일: ${new Date(stamp).toLocaleDateString()}`;

      // 2. 복합 인덱스 카드 계산 및 렌더링
      updateIndexCards(stages);

      // 3. 페르소나 및 매트릭스
      const persona = buildPersona(stages, data.survey, data.qeeg);
      $("personaTitle").textContent = persona.title;
      $("personaSummary").textContent = persona.summary;

      renderStageTable(stages);
      renderMatrix(buildMatrix(stages, data.survey, data.qeeg));
      
      const q = qualityFrom(stages);
      setBadge($("qualityBadge"), `품질: ${q.label}`, q.kind);
      
      const bOk = hasBaseline(stages);
      setBadge($("baselineBadge"), bOk ? "Baseline: 있음" : "Baseline: 없음", bOk ? "good" : "warn");

      if (stages.length) drawChart(stages);

    } catch (err) {
      console.error(err);
      $("personaTitle").textContent = "데이터를 불러올 수 없습니다.";
    }
  }

      const qeegCnt = data?.qeeg?.upload_cnt || 0;
      $("qeegBox").textContent = qeegCnt > 0
        ? `qEEG: 업로드 ${qeegCnt}개(가설 섹션 포함)`
        : "qEEG: 미업로드(해당 섹션 생략)";

      if (stages.length) drawChart(stages);

    } catch (err) {
      console.error(err);
      $("personaTitle").textContent = "리포트를 불러오지 못했습니다.";
      $("personaSummary").textContent = "서버 report-data 엔드포인트 또는 sid 연결을 확인해주세요.";
      setBadge($("qualityBadge"), "품질: -", "warn");
      setBadge($("baselineBadge"), "Baseline: -", "warn");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
