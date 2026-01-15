// report.js (완전 통합본)
(function () {
  const CLOUD_RUN_URL = "https://rhythme-server-as3ud42lpa-du.a.run.app";
  const apiUrl = (path) => `${CLOUD_RUN_URL.replace(/\/$/, "")}${path}`;

  // [도구] 안전한 엘리먼트 접근 함수 (에러 방지용)
  const $ = (id) => document.getElementById(id) || { 
    textContent: "", 
    style: {}, 
    innerHTML: "", 
    classList: { add: () => {}, remove: () => {} } 
  };

  // [기능] 세션 ID 가져오기
  function getSidSafe() {
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

  // [기능] 텍스트 복사
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("복사했습니다.");
    } catch {
      prompt("복사해서 사용하세요:", text);
    }
  }

  // [기능] 숫자 포맷팅
  function fmt(n, digits = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    return Number(n).toFixed(digits);
  }

  // [기능] 배지 설정
  function setBadge(el, text, kind) {
    el.textContent = text;
    el.classList.remove("good", "warn", "bad", "primary");
    if (kind) el.classList.add(kind);
  }

  // [분석] 데이터 품질 체크
  function qualityFrom(stages) {
    const okStages = stages.filter(s => s.status === "completed");
    const completeRatio = okStages.length / Math.max(1, stages.length);
    const snrs = stages.map(s => s.snr_est_db).filter(v => typeof v === "number");
    const avgSnr = snrs.length ? snrs.reduce((a,b)=>a+b,0)/snrs.length : null;
    const clips = stages.map(s => s.clipping_ratio).filter(v => typeof v === "number");
    const maxClip = clips.length ? Math.max(...clips) : null;
    const hasBad = stages.some(s => s.quality_flag && s.quality_flag !== "ok");

    if (completeRatio < 1) return { label: "낮음(미완료)", kind: "bad" };
    if (hasBad) return { label: "주의(품질 경고)", kind: "warn" };
    if (avgSnr !== null && avgSnr < 15) return { label: "낮음(소음)", kind: "bad" };
    if (maxClip !== null && maxClip > 0.02) return { label: "주의(클리핑)", kind: "warn" };
    return { label: "좋음", kind: "good" };
  }

  // [분석] 베이스라인 유무 확인
  function hasBaseline(stages) {
    return stages.some(s => s.stage_id === 1 && s.status === "completed" && (s.recorded_ms ?? 0) >= 30000);
  }

  // [분석] 페르소나 요약 생성 (데이터 리터러시)
 function buildPersona(stages, report, qeeg, insights) { // survey -> report로 변경
  if (!stages || stages.length < 2) {
    return { title: "데이터 분석 중", summary: "분석을 위한 충분한 세션 데이터가 아직 확보되지 않았습니다." };
  }
  const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
  const b = sorted.find(s => s.stage_id === 1) || sorted[0];
  const last = sorted[sorted.length - 1];
  
  let title = "데이터 기반 종합 판정";
  let summaryParts = [];

  // --- [Step 1: 음성 지표 해석 (핵심 풀백 지점)] ---
  if (insights && insights.summary_text) {
    // DB에 저장된 전문 해석이 있다면 그것을 먼저 넣습니다.
    summaryParts.push(insights.summary_text);
  } else {
    // [Fallback A] DB 인사이트가 없을 경우 JS에서 직접 계산하여 문장을 만듭니다.
    const dSr = last.speech_rate - b.speech_rate;
    const dPr = last.pause_ratio - b.pause_ratio;
    
    if (dSr > 0.05 && dPr < 0) {
      title = "인지적 가속 및 적응형";
      summaryParts.push("과제 후반부로 갈수록 발화 효율성이 높아지며 인지 부하에 능숙하게 적응하는 양상이 관찰됩니다.");
    } else {
      title = "신중한 정보 처리형";
      summaryParts.push("일정한 리듬을 유지하며 정보를 신중하게 구조화하여 전달하는 패턴을 보입니다.");
    }
  }

  // --- [Step 2: 복합 지표 추가 (DB SQL에 없는 내용)] ---
  // 에너지 밀도는 현재 SQL에 포함되지 않았으므로 JS에서 보완해줍니다.
  const energyDensity = last.pitch_sd / (last.speech_rate || 1);
  if (energyDensity > 8.5) {
    summaryParts.push(`에너지 밀도(${energyDensity.toFixed(1)})가 높아 메시지에 생동감을 더하는 능력이 탁월합니다.`);
  }

  // --- [Step 3: 외부 데이터 결합 (설문 등)] ---
if (report && report.total_score > 70) {
    summaryParts.push("기록지의 자기보고 지표와 음성 데이터의 활력 지수가 높은 일치율을 보입니다.");
  } else if (!report) {
    summaryParts.push("(기록지 내 추가 데이터가 연결되지 않아 음성 지표 위주로 분석되었습니다.)");
  }

  return { title, summary: summaryParts.join(" ") };
}

  // [분석] 3D 매트릭스 행 생성
function buildMatrix(stages, report, qeeg) { // survey -> report로 변경
    const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    const b = sorted.find(s => s.stage_id === 1) || sorted[0];
    const last = sorted[sorted.length - 1];
    const dPr = last.pause_ratio - b.pause_ratio;
    const resilience = sorted.find(s => s.stage_id === 4)?.speech_rate - sorted.find(s => s.stage_id === 3)?.speech_rate;

    return [
      { axis: "인지적 정밀도", evidence: `ΔPause: ${fmt(dPr, 3)}`, meaning: dPr < 0 ? "사고의 끊김이 줄어들며 유연성이 발휘됨" : "정보 처리 단계에서 신중함 증가" },
      { axis: "에너지 밀도", evidence: `Density: ${fmt(last.pitch_sd / (last.speech_rate || 1), 2)}`, meaning: "발화의 리듬감과 억양 변동을 통한 감정 전달력" },
      { axis: "회복 탄력성", evidence: `S3→S4 Δ: ${fmt(resilience, 2)}`, meaning: resilience > 0 ? "스트레스 이후 빠르게 페이스 회복" : "조절 시간 필요" }
    ];
  }

  // [UI] 인덱스 카드 업데이트
  function updateIndexCards(stages) {
    if (stages.length < 2) return;
    const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    const b = sorted[0];
    const last = sorted[sorted.length - 1];
    
    $("index-adaptive").textContent = (b.pause_ratio - last.pause_ratio) > 0.02 ? "높음" : "보통";
    const densityVal = last.pitch_sd / (last.speech_rate || 1);
    $("index-energy").textContent = densityVal > 9 ? "우수" : (densityVal > 7 ? "양호" : "보통");
    const s3 = sorted.find(s => s.stage_id === 3);
    const s4 = sorted.find(s => s.stage_id === 4);
    if (s3 && s4) $("index-resilience").textContent = (s4.speech_rate - s3.speech_rate) >= 0 ? "안정" : "관찰";
  }

  // [UI] 테이블 및 차트 렌더링 함수들
  function renderStageTable(stages) {
    const body = $("stageTableBody");
    body.innerHTML = "";
    stages.sort((a,b)=>a.stage_id-b.stage_id).forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${s.stage_id}</td><td>${s.status || "-"}</td><td>${fmt(s.speech_rate)}</td><td>${fmt(s.pause_ratio, 3)}</td><td>${fmt(s.pitch_sd)}</td><td>${fmt(s.snr_est_db, 1)}</td>`;
      body.appendChild(tr);
    });
  }

  function renderMatrix(rows) {
    const body = $("matrixBody");
    body.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><b>${r.axis}</b></td><td class="muted">${r.evidence}</td><td>${r.meaning}</td>`;
      body.appendChild(tr);
    });
  }

  function drawChart(stages) {
    const canvas = $("chart");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const data = [...stages].sort((a,b)=>a.stage_id-b.stage_id);
    function norm(arr) {
      const vals = arr.filter(v => typeof v === "number");
      const min = Math.min(...vals), max = Math.max(...vals);
      return arr.map(v => (typeof v === "number" && max > min) ? (v - min) / (max - min) : 0.5);
    }

    const sr = norm(data.map(d=>d.speech_rate)), pr = norm(data.map(d=>d.pause_ratio)), ps = norm(data.map(d=>d.pitch_sd));
    const left = 40, right = cssW - 12, top = 12, bottom = cssH - 28;
    const xAt = (i) => left + (right-left) * (i/(data.length-1 || 1));
    const yAt = (t) => bottom - (bottom-top) * t;

    [sr, pr, ps].forEach((arr, si) => {
      ctx.strokeStyle = si === 0 ? "#BB86FC" : (si === 1 ? "#03DAC6" : "#CF6679");
      ctx.lineWidth = 2; ctx.beginPath();
      arr.forEach((v, i) => i === 0 ? ctx.moveTo(xAt(i), yAt(v)) : ctx.lineTo(xAt(i), yAt(v)));
      ctx.stroke();
    });
    $("chartLegend").textContent = "그래프(상대 스케일): Speech Rate(보라) / Pause Ratio(민트) / Pitch SD(핑크)";
  }

  async function fetchReportData(sid) {
    const urls = [apiUrl("/report-data") + "?sid=" + sid, apiUrl("/report-data/" + sid)];
    for (const url of urls) {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    }
    throw new Error("404");
  }

  
async function init() {
    const sid = getSidSafe();
    if (!sid) return;

    try {
        // 1. 데이터 가져오기 (v2)
        const res = await fetch(apiUrl(`/report-data-v2?sid=${sid}`)); 
        const rawData = await res.json();
        
        // 데이터 본체 찾기 (depth 방어 로직)
        const data = rawData.report_json || rawData;
        const voice = data.voice || {};
        const v_stages = voice.stages || []; // 변수명을 v_stages로 명확히 함

        // 2. [강화] SQ 점수 표시
        const sqScore = data.survey?.total_score || data.total_score || 0;
        if($("sqScoreDisplay")) $("sqScoreDisplay").textContent = `${sqScore}점`;

        // 3. [강화] qEEG 상태 표시 (여러 경로 탐색)
        const qeegCount = data.qeeg?.upload_cnt || voice.qeeg?.upload_cnt || 0;
        if($("qeegStatusDisplay")) {
            $("qeegStatusDisplay").textContent = qeegCount > 0 ? `✅ ${qeegCount}건 연동됨` : "❌ 미업로드";
            if(qeegCount > 0) $("qeegStatusDisplay").style.color = "#03DAC6"; // 민트색 강조
        }

        // 4. 인덱스 3대장 계산 (변수명 v_stages 전달)
        if (v_stages.length > 0) {
            calculateCustomIndices(v_stages);
            if (typeof drawChart === 'function') drawChart(v_stages);
            if (typeof renderStageTable === 'function') renderStageTable(v_stages);
        }

        // 5. 페르소나 설명 (DB profile 연동)
        const profile = voice.profile || {};
        if($("personaTitle")) $("personaTitle").textContent = profile.type_name || "분석 중";
        if($("personaSummary")) $("personaSummary").textContent = profile.summary || "";
        if($("watchoutText")) $("watchoutText").textContent = profile.watchout || "";

        // 강점 리스트
        const strengths = STRENGTHS_MAP[profile.type_code] || [];
        if($("strengthList")) {
            $("strengthList").innerHTML = strengths.map(s => `<li>${s}</li>`).join("");
        }

        // 6. 핵심 지표 표 (metrics_card)
        if($("metricsBody") && voice.metrics_card) {
            $("metricsBody").innerHTML = voice.metrics_card.map(m => `
                <tr>
                    <td style="font-weight:600;">${m.label}</td>
                    <td style="color: var(--primary); font-weight:bold;">${m.value}</td>
                    <td style="font-size: 0.85rem; color: #E4E4E7;">${m.interpretation}</td>
                </tr>
            `).join("");
        }

       // 6. 설문 버튼 연결
      const surveyBtn = $("btnStartSurvey");
      if (surveyBtn) {
        surveyBtn.onclick = () => {
          const FORM_BASE = "https://docs.google.com/forms/d/e/1FAIpQLSdYVDquseww9O3hvJgRyYmlZxT0BhZ5e_gxmG8mgFWAbx3a4Q/viewform";
          const u = new URL(FORM_BASE);
          u.searchParams.set("usp", "pp_url");
          u.searchParams.set("entry.1445339256", sid);
          u.searchParams.append("entry.293321030", "SQ(체계화)");
          u.searchParams.append("entry.293321030", "음성 (프로소디)");
          location.href = u.toString();
        };
      }

    } catch (err) {
        console.error("Report Load Error:", err);
    }
}

  document.addEventListener("DOMContentLoaded", init);
})();
