(function () {
  const CLOUD_RUN_URL = "https://rhythme-server-as3ud42lpa-du.a.run.app";
  const apiUrl = (path) => `${CLOUD_RUN_URL.replace(/\/$/, "")}${path}`;

  // [도구] 안전한 엘리먼트 접근 함수
  const $ = (id) => document.getElementById(id) || { 
    textContent: "", style: {}, innerHTML: "", classList: { add: () => {}, remove: () => {} } 
  };

  // [상수] 페르소나별 강점 매핑
  const STRENGTHS_MAP = {
    'PRECISION_TURBO': ['압도적인 정보 처리 속도', '고부하 상황에서의 냉철한 통제력', '정교한 논리 구조화'],
    'OVERCLOCK_BOTTLENECK': ['빠른 상황 판단력', '높은 목표 지향성', '역동적인 에너지'],
    'LOAD_ACCUMULATION': ['신중한 검토 능력', '단계적 사고', '데이터 정밀도'],
    'PROSODY_SENSITIVE': ['섬세한 감각 인지', '풍부한 공감 채널', '맥락 파악 능력'],
    'STEADY_ARCHITECT': ['안정적인 일관성', '높은 신뢰도', '균형 잡힌 정보 처리']
  };

  // [기능] 세션 ID 안전하게 가져오기
  function getSidSafe() {
    return new URLSearchParams(location.search).get("sid") || 
           localStorage.getItem("SESSION_ID") || 
           window.SESSION_ID;
  }

  // [기능] 텍스트 클립보드 복사
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("세션 ID를 복사했습니다.");
    } catch {
      prompt("복사해서 사용하세요:", text);
    }
  }

  // [기능] 숫자 포맷팅
  function fmt(n, digits = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    return Number(n).toFixed(digits);
  }

  // [기능] 배지 스타일 및 텍스트 설정
  function setBadge(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = "badge"; // 클래스 초기화
    if (kind) el.classList.add(kind);
  }

  // [기능] 데이터 품질 판정
  function qualityFrom(stages) {
    const okStages = stages.filter(s => s.status === "completed");
    const hasBad = stages.some(s => s.quality_flag && s.quality_flag !== "ok");
    if (okStages.length < stages.length) return { label: "낮음(미완료)", kind: "bad" };
    if (hasBad) return { label: "주의(품질 경고)", kind: "warn" };
    return { label: "좋음", kind: "good" };
  }

  // [기능] 3대 인덱스 계산 (적응도, 에너지, 탄력성)
  function calculateCustomIndices(stages) {
    if (!stages || stages.length < 2) return;
    const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    const b = sorted[0];
    const last = sorted[sorted.length - 1];
    const s3 = sorted.find(s => s.stage_id === 3);
    const s4 = sorted.find(s => s.stage_id === 4);

    if($("index-adaptive")) $("index-adaptive").textContent = (b.pause_ratio - last.pause_ratio) > 0.02 ? "높음" : "보통";
    const energyVal = last.pitch_sd / (last.speech_rate || 1);
    if($("index-energy")) $("index-energy").textContent = energyVal > 8.5 ? "우수" : (energyVal > 7 ? "양호" : "보통");
    const resilience = ((s4?.speech_rate || 0) - (s3?.speech_rate || 0)) >= -0.1 ? "안정" : "관찰";
    if($("index-resilience")) $("index-resilience").textContent = resilience;
  }

  // [UI] 스테이지별 상세 데이터 테이블 렌더링
  function renderStageTable(stages) {
    const body = $("stageTableBody");
    if (!body) return;
    body.innerHTML = "";
    [...stages].sort((a,b) => a.stage_id - b.stage_id).forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.stage_id}</td>
        <td>${s.status || "-"}</td>
        <td>${fmt(s.speech_rate)}</td>
        <td>${fmt(s.pause_ratio, 3)}</td>
        <td>${fmt(s.pitch_sd)}</td>
        <td>${fmt(s.snr_est_db, 1)}</td>
      `;
      body.appendChild(tr);
    });
  }

  // [기능] 차트 그리기
  function drawChart(stages) {
    const canvas = $("chart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const data = [...stages].sort((a,b)=>a.stage_id-b.stage_id);
    const norm = (arr) => {
      const vals = arr.filter(v => typeof v === "number");
      const min = Math.min(...vals), max = Math.max(...vals);
      return arr.map(v => (max > min) ? (v - min) / (max - min) : 0.5);
    };

    const sr = norm(data.map(d=>d.speech_rate)), pr = norm(data.map(d=>d.pause_ratio)), ps = norm(data.map(d=>d.pitch_sd));
    const left = 40, right = cssW - 20, top = 20, bottom = cssH - 30;
    const xAt = (i) => left + (right-left) * (i/(data.length-1 || 1));
    const yAt = (t) => bottom - (bottom-top) * t;

    [sr, pr, ps].forEach((arr, si) => {
      ctx.strokeStyle = si === 0 ? "#BB86FC" : (si === 1 ? "#03DAC6" : "#CF6679");
      ctx.lineWidth = 3; ctx.beginPath();
      arr.forEach((v, i) => i === 0 ? ctx.moveTo(xAt(i), yAt(v)) : ctx.lineTo(xAt(i), yAt(v)));
      ctx.stroke();
    });
    $("chartLegend").textContent = "Speech Rate(보라) / Pause Ratio(민트) / Pitch SD(핑크)";
  }

  // [실행] 초기화 함수
  async function init() {
    const sid = getSidSafe();
    if (!sid) {
      alert("세션 ID가 없습니다. 다시 시작해주세요.");
      location.href = "./index.html";
      return;
    }

    // 세션 ID 표시 및 복사 버튼 연결
    if ($("sidDisplay")) $("sidDisplay").textContent = sid;
    const copyBtn = $("copySidBtn");
    if (copyBtn) copyBtn.onclick = () => copyText(sid);

   try {
  const res = await fetch(apiUrl(`/report-data-v2?sid=${sid}`)); 
  const rawData = await res.json();
  const data = rawData.report_json || rawData; 
  
  // 1. qEEG 상태 판정 로직 강화
  const qeeg = data.qeeg || {};
  // upload_cnt가 있거나, qeeg_data 자체가 존재하거나, 혹은 다른 필드(has_qeeg 등)가 있는지 체크
  const isQeegConnected = (qeeg.upload_cnt > 0) || (qeeg.data && qeeg.data.length > 0) || (data.has_qeeg === true);

  if($("qeegStatusDisplay")) {
    $("qeegStatusDisplay").textContent = isQeegConnected ? "✅ 연동 완료" : "❌ 미연동";
    if(isQeegConnected) $("qeegStatusDisplay").style.color = "var(--secondary)"; // 민트색으로 강조
  }

  // 2. SQ 점수 표시
  if($("sqScoreDisplay")) {
    // survey 점수 혹은 total_score 위치 확인
    const sqScore = data.survey?.total_score || data.total_score || 0;
    $("sqScoreDisplay").textContent = `${sqScore}점`;
  }

      // 2. 품질 및 베이스라인 체크 (배지 업데이트)
      if (stages.length > 0) {
        const q = qualityFrom(stages);
        setBadge($("qualityBadge"), `품질: ${q.label}`, q.kind);
        
        const hasB = stages.some(s => s.stage_id === 1 && s.status === "completed");
        setBadge($("baselineBadge"), hasB ? "Baseline: 있음" : "Baseline: 없음", hasB ? "good" : "warn");

        // 3. 인덱스 및 상세 테이블
        calculateCustomIndices(stages);
        renderStageTable(stages);
        drawChart(stages);
      }

      // 4. 페르소나 및 강점 (DB profile 연동)
      const profile = voice.profile || {};
      if ($("personaTitle")) $("personaTitle").textContent = profile.type_name || "분석 불가";
      if ($("personaSummary")) $("personaSummary").textContent = profile.summary || "데이터가 부족하여 요약을 생성할 수 없습니다.";
      if ($("watchoutText")) $("watchoutText").textContent = profile.watchout || "";
      
      const strengths = STRENGTHS_MAP[profile.type_code] || [];
      if ($("strengthList")) {
        $("strengthList").innerHTML = strengths.length > 0 
          ? strengths.map(s => `<li>${s}</li>`).join("")
          : "<li>데이터를 분석 중입니다.</li>";
      }

      // 5. 핵심 지표 표 (metrics_card)
      if($("metricsBody") && voice.metrics_card) {
        $("metricsBody").innerHTML = voice.metrics_card.map(m => `
          <tr>
            <td style="font-weight:600;">${m.label}</td>
            <td style="color: var(--primary); font-weight:bold;">${m.value}</td>
            <td style="font-size: 0.8rem; color: #E4E4E7;">${m.interpretation}</td>
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
      $("personaTitle").textContent = "데이터 로드 실패";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();