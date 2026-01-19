// report.js (v2 통일 + report.js 왁구 유지 + result.js 프로필/metrics_card 흡수)

(function () {
  const CLOUD_RUN_URL = "https://rhythme-server-as3ud42lpa-du.a.run.app";
  const apiUrl = (path) => `${CLOUD_RUN_URL.replace(/\/$/, "")}${path}`;

  // [도구] 안전한 DOM 접근
  const $ = (id) => document.getElementById(id);

  // [기능] 세션 ID 가져오기
  function getSidSafe() {
    const sid =
      window.getSid?.() ||
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

  // [기능] 숫자 포맷팅
  function fmt(n, digits = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    return Number(n).toFixed(digits);
  }

  // [기능] 배지 설정
  function setBadge(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("good", "warn", "bad", "primary");
    if (kind) el.classList.add(kind);
  }

  // [분석] 데이터 품질 체크
  function qualityFrom(stages) {
    const okStages = stages.filter((s) => s.status === "completed");
    const completeRatio = okStages.length / Math.max(1, stages.length);

    const snrs = stages.map((s) => s.snr_est_db).filter((v) => typeof v === "number");
    const avgSnr = snrs.length ? snrs.reduce((a, b) => a + b, 0) / snrs.length : null;

    const clips = stages.map((s) => s.clipping_ratio).filter((v) => typeof v === "number");
    const maxClip = clips.length ? Math.max(...clips) : null;

    const hasBad = stages.some((s) => s.quality_flag && s.quality_flag !== "ok");

    if (completeRatio < 1) return { label: "낮음(미완료)", kind: "bad" };
    if (hasBad) return { label: "주의(품질 경고)", kind: "warn" };
    if (avgSnr !== null && avgSnr < 15) return { label: "낮음(소음)", kind: "bad" };
    if (maxClip !== null && maxClip > 0.02) return { label: "주의(클리핑)", kind: "warn" };
    return { label: "좋음", kind: "good" };
  }

  // [분석] 베이스라인 유무 확인
  function hasBaseline(stages) {
    return stages.some(
      (s) => s.stage_id === 1 && s.status === "completed" && (s.recorded_ms ?? 0) >= 30000
    );
  }

  // [분석] 3D 매트릭스(프론트 fallback)
  function buildMatrixFallback(stages) {
    const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    const b = sorted.find((s) => s.stage_id === 1) || sorted[0];
    const last = sorted[sorted.length - 1];

    const dPr = (last?.pause_ratio ?? 0) - (b?.pause_ratio ?? 0);

    const s3 = sorted.find((s) => s.stage_id === 3);
    const s4 = sorted.find((s) => s.stage_id === 4);
    const resilience = s3 && s4 ? (s4.speech_rate ?? 0) - (s3.speech_rate ?? 0) : null;

    const density = (last?.pitch_sd ?? 0) / ((last?.speech_rate ?? 1) || 1);

    return [
      {
        axis: "인지적 정밀도",
        evidence: `ΔPause: ${fmt(dPr, 3)}`,
        meaning: dPr < 0 ? "사고의 끊김이 줄어들며 유연성이 발휘됨" : "정보 처리 단계에서 신중함 증가",
      },
      {
        axis: "에너지 밀도",
        evidence: `Density: ${fmt(density, 2)}`,
        meaning: "발화의 리듬감과 억양 변동을 통한 감정 전달력",
      },
      {
        axis: "회복 탄력성",
        evidence: `S3→S4 Δ: ${resilience === null ? "-" : fmt(resilience, 2)}`,
        meaning: resilience === null ? "측정 구간 부족" : resilience > 0 ? "스트레스 이후 빠르게 페이스 회복" : "조절 시간 필요",
      },
    ];
  }

  // [UI] 인덱스 카드 업데이트 (프론트 fallback)
  function updateIndexCardsFallback(stages) {
    if (stages.length < 2) return;

    const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    const b = sorted[0];
    const last = sorted[sorted.length - 1];

    const adaptiveEl = $("index-adaptive");
    const energyEl = $("index-energy");
    const resilEl = $("index-resilience");

    if (adaptiveEl) adaptiveEl.textContent = (b.pause_ratio - last.pause_ratio) > 0.02 ? "높음" : "보통";

    const densityVal = (last.pitch_sd ?? 0) / ((last.speech_rate ?? 1) || 1);
    if (energyEl) energyEl.textContent = densityVal > 9 ? "우수" : densityVal > 7 ? "양호" : "보통";

    const s3 = sorted.find((s) => s.stage_id === 3);
    const s4 = sorted.find((s) => s.stage_id === 4);
    if (resilEl && s3 && s4) resilEl.textContent = (s4.speech_rate - s3.speech_rate) >= 0 ? "안정" : "관찰";
  }

  // [UI] 스테이지 테이블
  function renderStageTable(stages) {
    const body = $("stageTableBody");
    if (!body) return;

    body.innerHTML = "";
    stages
      .slice()
      .sort((a, b) => a.stage_id - b.stage_id)
      .forEach((s) => {
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

  // [UI] 3D 매트릭스 표 렌더
  function renderMatrix(rows) {
    const body = $("matrixBody");
    if (!body) return;

    body.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><b>${r.axis}</b></td><td class="muted">${r.evidence}</td><td>${r.meaning}</td>`;
      body.appendChild(tr);
    });
  }

  // [UI] 차트(상대 스케일)
  function drawChart(stages) {
    const canvas = $("chart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight || 220;

    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const data = [...stages].sort((a, b) => a.stage_id - b.stage_id);
    if (data.length < 2) return;

    function norm(arr) {
      const vals = arr.filter((v) => typeof v === "number");
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return arr.map((v) => (typeof v === "number" && max > min ? (v - min) / (max - min) : 0.5));
    }

    const sr = norm(data.map((d) => d.speech_rate));
    const pr = norm(data.map((d) => d.pause_ratio));
    const ps = norm(data.map((d) => d.pitch_sd));

    const left = 40,
      right = cssW - 12,
      top = 12,
      bottom = cssH - 28;

    const xAt = (i) => left + (right - left) * (i / (data.length - 1));
    const yAt = (t) => bottom - (bottom - top) * t;

    [sr, pr, ps].forEach((arr, si) => {
      ctx.strokeStyle = si === 0 ? "#BB86FC" : si === 1 ? "#03DAC6" : "#CF6679";
      ctx.lineWidth = 2;
      ctx.beginPath();
      arr.forEach((v, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(v)) : ctx.lineTo(xAt(i), yAt(v))));
      ctx.stroke();
    });

    const legend = $("chartLegend");
    if (legend) {
      legend.textContent =
        "그래프(상대 스케일): Speech Rate(보라) / Pause Ratio(민트) / Pitch SD(핑크)";
    }
  }

  // ============================
// Persona vA: 4축(16) + 상위5(아키타입)
// ============================

// 0) 유틸
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickStage(stages, id) {
  return stages.find(s => Number(s.stage_id) === id) || null;
}

function sortStages(stages) {
  return [...(stages || [])].sort((a, b) => Number(a.stage_id) - Number(b.stage_id));
}

// 1) 축 판단 기준(튜닝 가능)
const AXIS_THRESHOLDS = {
  // Speech Rate: fast / measured
  FAST_SR: 7.2,

  // Pause Ratio: tight / spacious  (pause_ratio가 낮을수록 타이트)
  TIGHT_PR: 0.30,

  // Expressive: pitch_sd / (speech_rate) = density
  EXPRESSIVE_DENSITY: 9.0,

  // Adaptive: 가속/휴지 개선 + 회복
  ADAPT_DSR: 0.25,       // S1→Last 속도 증가
  ADAPT_DPR: -0.01,      // S1→Last 휴지 감소(개선)
};

// 2) 상위 5개 아키타입 (parent)
const PARENT_TYPES = {
  PRECISION_TURBO: {
    name: "정교 고속 제어형",
    base_strengths: ["압도적인 정보 처리 속도", "고부하 상황에서의 냉철한 통제력", "정교한 논리 구조화"],
    base_watchout: "의도적인 휴지(호흡)를 넣으면 전달력이 더 좋아집니다."
  },
  OVERCLOCK_BOTTLENECK: {
    name: "오버클럭 병목형",
    base_strengths: ["사고의 속도가 출력을 앞섬", "역동적인 에너지", "빠른 판단력"],
    base_watchout: "문장 단위를 짧게 끊고, 한 번 더 호흡을 넣어 과열을 줄이세요."
  },
  LOAD_ACCUMULATION: {
    name: "신중 누적형",
    base_strengths: ["신중한 검토 능력", "단계적 사고", "데이터 정밀도"],
    base_watchout: "결론을 먼저 말한 뒤 근거를 붙이면 설득력이 더 좋아집니다."
  },
  PROSODY_SENSITIVE: {
    name: "프로소디 민감형",
    base_strengths: ["섬세한 감각 인지", "맥락 파악 능력", "풍부한 공감 채널"],
    base_watchout: "상대가 원하는 결론 포인트를 명확히 찍어주면 강점이 더 살아납니다."
  },
  STEADY_ARCHITECT: {
    name: "안정 설계형",
    base_strengths: ["안정적인 일관성", "높은 신뢰도", "균형 잡힌 정보 처리"],
    base_watchout: "핵심 포인트를 2~3개로 압축하면 임팩트가 더 커집니다."
  },
};

// 3) 16개 서브타입 이름 (4축 조합)
const SUBTYPE_NAME = {
  // 키 규칙: SR(FAST/MEAS) + PR(TIGHT/SPACE) + EXPR(EXPR/MINI) + ADAPT(ADAPT/SENS)
  FAST_TIGHT_EXPR_ADAPT: "추진 리더",
  FAST_TIGHT_EXPR_SENS:  "과열 스파크",
  FAST_TIGHT_MINI_ADAPT: "초고속 압축",
  FAST_TIGHT_MINI_SENS:  "고속 병목",

  FAST_SPACE_EXPR_ADAPT: "고속 스토리",
  FAST_SPACE_EXPR_SENS:  "가속 흔들림",
  FAST_SPACE_MINI_ADAPT: "고속 설계",
  FAST_SPACE_MINI_SENS:  "속도 과부하",

  MEAS_TIGHT_EXPR_ADAPT: "정밀 드라이브",
  MEAS_TIGHT_EXPR_SENS:  "긴장 조절",
  MEAS_TIGHT_MINI_ADAPT: "정밀 리포터",
  MEAS_TIGHT_MINI_SENS:  "경직 압축",

  MEAS_SPACE_EXPR_ADAPT: "회복 스토리",
  MEAS_SPACE_EXPR_SENS:  "민감 공감",
  MEAS_SPACE_MINI_ADAPT: "차분 설계",
  MEAS_SPACE_MINI_SENS:  "과신중 누적",
};

// 4) 축별 보정 강점(“재미” 포인트)
const AXIS_STRENGTHS = {
  FAST: ["빠른 결론 도출", "실행 속도"],
  MEAS: ["안정된 페이스", "오류 회피 능력"],

  TIGHT: ["집중형 전달", "군더더기 제거"],
  SPACE: ["맥락 구성", "설명/설득 여유"],

  EXPR: ["감정/강조 전달력", "현장 몰입감"],
  MINI: ["정보 중심 전달", "명료한 문장 구조"],

  ADAPT: ["후반 적응", "상황 전환 대응"],
  SENS: ["민감한 신호 감지", "안정화 필요 인지"],
};

// 5) 4축 계산 + parent/subtype 결정
function classifyPersona16(stages) {
  const sorted = sortStages(stages);
  if (sorted.length < 2) {
    return {
      parent_code: "STEADY_ARCHITECT",
      parent_name: PARENT_TYPES.STEADY_ARCHITECT.name,
      subtype_code: "MEAS_SPACE_MINI_SENS",
      subtype_name: SUBTYPE_NAME.MEAS_SPACE_MINI_SENS,
      title: "데이터 분석 중",
      subtitle: "",
      summary: "분석을 위한 충분한 세션 데이터가 아직 확보되지 않았습니다.",
      watchout: "데이터가 더 쌓이면 더 정확해집니다.",
      strengths: []
    };
  }

  const s1 = pickStage(sorted, 1) || sorted[0];
  const last = sorted[sorted.length - 1];
  const s3 = pickStage(sorted, 3);
  const s4 = pickStage(sorted, 4);

  const s1sr = num(s1.speech_rate);
  const s1pr = num(s1.pause_ratio);
  const lsr = num(last.speech_rate);
  const lpr = num(last.pause_ratio);
  const lps = num(last.pitch_sd);

  const dSr = (lsr != null && s1sr != null) ? (lsr - s1sr) : null;
  const dPr = (lpr != null && s1pr != null) ? (lpr - s1pr) : null;

  const density = (lps != null && lsr != null) ? (lps / (lsr || 1)) : null;

  const resilience = (s3?.speech_rate != null && s4?.speech_rate != null)
    ? (num(s4.speech_rate) - num(s3.speech_rate))
    : null;

  // 축 A: 속도
  const A = (lsr != null && lsr >= AXIS_THRESHOLDS.FAST_SR) ? "FAST" : "MEAS";

  // 축 B: 리듬/휴지
  const B = (lpr != null && lpr <= AXIS_THRESHOLDS.TIGHT_PR) ? "TIGHT" : "SPACE";

  // 축 C: 표현 에너지
  const C = (density != null && density >= AXIS_THRESHOLDS.EXPRESSIVE_DENSITY) ? "EXPR" : "MINI";

  // 축 D: 적응/민감
  let D = "SENS";
  const adaptByTrend = (dSr != null && dPr != null)
    ? (dSr >= AXIS_THRESHOLDS.ADAPT_DSR && dPr <= AXIS_THRESHOLDS.ADAPT_DPR)
    : false;
  const adaptByRecovery = (resilience != null) ? (resilience >= 0) : false;
  if (adaptByTrend || adaptByRecovery) D = "ADAPT";

  const subtype_code = `${A}_${B}_${C}_${D}`;
  const subtype_name = SUBTYPE_NAME[subtype_code] || "혼합형";

  // 상위 parent 결정 (휴리스틱: 지금 데이터로 제일 납득 가는 방식)
  let parent_code = "STEADY_ARCHITECT";

  // 1) 정교 고속: 빠르고(FAST) + 타이트(TIGHT) 성향이 강하면
  if (A === "FAST" && B === "TIGHT") parent_code = "PRECISION_TURBO";

  // 2) 오버클럭 병목: FAST인데 D가 SENS거나 dPr이 개선이 아니면
  if (A === "FAST" && (D === "SENS" || (dPr != null && dPr >= 0))) parent_code = "OVERCLOCK_BOTTLENECK";

  // 3) 신중 누적: MEAS + SPACE + MINI에 가까울수록
  if (A === "MEAS" && B === "SPACE" && C === "MINI") parent_code = "LOAD_ACCUMULATION";

  // 4) 프로소디 민감: EXPR이면서 D가 SENS면
  if (C === "EXPR" && D === "SENS") parent_code = "PROSODY_SENSITIVE";

  // 5) 안정 설계: 그 외 (또는 데이터가 안정적이면)
  if (parent_code !== "PRECISION_TURBO" && parent_code !== "OVERCLOCK_BOTTLENECK") {
    if (A === "MEAS" && (B === "TIGHT" || B === "SPACE")) parent_code = "STEADY_ARCHITECT";
  }

  const parent = PARENT_TYPES[parent_code];

  // 요약(짧고 모바일 친화)
  const bits = [];
  bits.push(`${parent.name} 패턴입니다.`);
  bits.push(`서브 타입은 “${subtype_name}”입니다.`);

  // 근거 한 줄(있을 때만)
  if (dSr != null && dPr != null) {
    bits.push(`(S1→Last 변화: ΔSR ${dSr.toFixed(2)}, ΔPause ${dPr.toFixed(3)})`);
  } else if (resilience != null) {
    bits.push(`(회복: S3→S4 ΔSR ${resilience.toFixed(2)})`);
  }

  // watchout: parent 기본 + 서브 보정
  let watchout = parent.base_watchout;
  if (D === "SENS" && resilience == null) {
    watchout = "일부 스테이지(예: 3)가 누락되어 회복 지표는 ‘측정 불가’일 수 있습니다. 페이스를 일정하게 가져가면 정확도가 올라갑니다.";
  }

  // 강점: parent 3개 + 축 보정 1~2개 (너무 길지 않게)
  const strengths = [
    ...parent.base_strengths,
    AXIS_STRENGTHS[A][0],
    AXIS_STRENGTHS[C][0],
  ].slice(0, 5);

  return {
    parent_code,
    parent_name: parent.name,
    subtype_code,
    subtype_name,
    title: parent.name,              // 메인 타이틀(상위 5개)
    subtitle: `– ${subtype_name}`,    // 서브 타이틀(16개)
    summary: bits.join(" "),
    watchout,
    strengths,
    _debug: { A, B, C, D, dSr, dPr, density, resilience }
  };
}

// 6) 기존 buildPersona를 대체할 “vA buildPersona”
function buildPersona(stages, report, qeeg, insights) {
  // DB에서 insights.summary_text가 있으면 우선(있을 때만)
  if (insights && insights.summary_text) {
    return {
      title: "데이터 기반 종합 판정",
      subtitle: "",
      summary: insights.summary_text,
      type_code: "INSIGHT",
      strengths: []
    };
  }

  const p = classifyPersona16(stages);

  // report(설문)과 결합 문구는 짧게만
  const extras = [];
  if (report && report.total_score > 70) extras.push("자기보고 지표와 음성 지표가 높은 일치율을 보입니다.");
  if (!report) extras.push("(기록지 데이터가 없어 음성 지표 위주로 분석되었습니다.)");

  return {
    title: p.title,
    subtitle: p.subtitle,
    summary: [p.summary, ...extras].join(" "),
    type_code: p.subtype_code,       // ✅ 16타입 코드
    parent_code: p.parent_code,      // ✅ 상위 5개 코드
    watchout: p.watchout,
    strengths: p.strengths
  };
}


  // -------------------------
  // v2 프로필/핵심지표 흡수 파트
  // -------------------------

  // result.js의 강점 사전
  const STRENGTHS_MAP = {
    PRECISION_TURBO: ["압도적인 정보 처리 속도", "고부하 상황에서의 냉철한 통제력", "정교한 논리 구조화"],
    OVERCLOCK_BOTTLENECK: ["사고의 속도가 출력을 앞섬", "역동적인 에너지", "빠른 판단력"],
    LOAD_ACCUMULATION: ["신중한 검토 능력", "단계적 사고", "데이터 정밀도"],
    PROSODY_SENSITIVE: ["섬세한 감각 인지", "맥락 파악 능력", "풍부한 공감 채널"],
    STEADY_ARCHITECT: ["안정적인 일관성", "높은 신뢰도", "균형 잡힌 정보 처리"],
  };

  function ensureMetricsSection() {
    // report.html에 없으면, stage 테이블 위에 자동 삽입
    if ($("metricsBody")) return;

    const stageCard = document.querySelector(".card-title")?.closest(".card") || null;
    // stageCard를 못 찾으면, grid-container 뒤에 넣기
    const insertBefore = stageCard || document.querySelector(".action-area") || null;

    const wrap = document.createElement("section");
    wrap.className = "card";
    wrap.id = "metricsCardAuto";
    wrap.innerHTML = `
      <div class="card-title">핵심 인지 제어 지표</div>
      <table>
        <thead>
          <tr><th>분석 항목</th><th>나의 수치</th><th>전문 해석 (Insight)</th></tr>
        </thead>
        <tbody id="metricsBody"></tbody>
      </table>
      <div style="font-size:11px;color:var(--muted);margin-top:10px;">
        ※ 베타 분석 지표입니다. 임상적 진단을 대체하지 않습니다.
      </div>
    `;

    if (insertBefore && insertBefore.parentElement) {
      insertBefore.parentElement.insertBefore(wrap, insertBefore);
    } else {
      document.body.appendChild(wrap);
    }
  }

  function renderMetricsCard(metricsCard) {
    if (!metricsCard || !Array.isArray(metricsCard) || metricsCard.length === 0) return;
    ensureMetricsSection();

    const body = $("metricsBody");
    if (!body) return;

    body.innerHTML = metricsCard
      .map(
        (m) => `
      <tr>
        <td>${m.label ?? "-"}</td>
        <td class="val-col">${m.value ?? "-"}</td>
        <td class="desc-col">${m.interpretation ?? "-"}</td>
      </tr>
    `
      )
      .join("");
  }

function applyProfile() {
  // ✅ 1) 서버 profile 있으면 그걸 우선
  if (profile && profile.type_name) {
    const titleEl = $("personaTitle");
    const sumEl = $("personaSummary");
    if (titleEl) titleEl.textContent = profile.type_name;
    if (sumEl) sumEl.textContent = profile.summary || "";

    const watchEl = $("watchoutText");
    if (watchEl && profile.watchout) watchEl.textContent = profile.watchout;

    const strengthList = $("strengthList");
    if (strengthList) {
      const strengths = STRENGTHS_MAP[profile.type_code] || [];
      if (strengths.length) strengthList.innerHTML = strengths.map((s) => `<li>${s}</li>`).join("");
    }
    return;
  }

  // ✅ 2) 서버 profile이 없거나 빈약하면: 프론트 16타입(A안)로 대체
  if (Array.isArray(stages) && stages.length >= 2) {
    const persona = buildPersona(stages, data.survey, data.qeeg, data.insights);

// 메인/서브 타이틀
$("personaTitle").textContent = persona.title || "-";

// subtitle을 summary에 붙이거나, 별도 엘리먼트가 있으면 거기 넣기
// (HTML에 personaSubtitle 없으면 summary 앞에 붙여도 됨)
const subEl = document.getElementById("personaSubtitle");
if (subEl) {
  subEl.textContent = persona.subtitle || "";
} else {
  // subtitle 엘리먼트 없으면 summary 첫 부분에 넣기(가볍게)
  $("personaSummary").textContent = `${persona.subtitle ? persona.subtitle + " " : ""}${persona.summary || "-"}`;
}

// 강점 리스트(서브타입 기준)
const ul = document.getElementById("strengthList");
if (ul) {
  const strengths = persona.strengths || [];
  ul.innerHTML = strengths.map(s => `<li>${s}</li>`).join("");
}

// watchout(HTML에 있으면)
const w = document.getElementById("watchoutText");
if (w && persona.watchout) w.textContent = persona.watchout;

    const titleEl = $("personaTitle");
    const sumEl = $("personaSummary");

    if (titleEl) titleEl.textContent = persona.title || "분석 결과";
    if (sumEl) sumEl.textContent = `${persona.subtitle ? persona.subtitle + " " : ""}${persona.summary || ""}`;

    const watchEl = $("watchoutText");
    if (watchEl && persona.watchout) watchEl.textContent = persona.watchout;

    const strengthList = $("strengthList");
    if (strengthList) {
      const strengths = persona.strengths || [];
      strengthList.innerHTML = strengths.map((s) => `<li>${s}</li>`).join("");
    }
  }
}


  function applyTopSummary(data) {
    // result.html 스타일 요소가 report.html에 없어도 안전하게(있으면 채움)
    const sq = data?.survey?.total_score;
    if ($("sqScore") && typeof sq === "number") $("sqScore").textContent = `${sq}점`;

    const qeegCnt = data?.qeeg?.upload_cnt || 0;
    if ($("qeegStatus")) {
      $("qeegStatus").textContent = qeegCnt > 0 ? `✅ 연동 완료 (${qeegCnt}건)` : "❌ 미연동";
      if (qeegCnt > 0) $("qeegStatus").classList.add("active");
    }
  }

  // v2 데이터 로드
async function fetchReportDataV2(sid) {
  const tries = [
    apiUrl("/report-data-v2") + "?sid=" + encodeURIComponent(sid),
    apiUrl("/report-data-v2/" + encodeURIComponent(sid)),
    apiUrl("/report-data") + "?sid=" + encodeURIComponent(sid),
    apiUrl("/report-data/" + encodeURIComponent(sid)),
  ];

  const attempts = [];

  for (const url of tries) {
    try {
      const res = await fetch(url);
      attempts.push(`${res.status} ${url}`);

      if (!res.ok) continue;

      const raw = await res.json();
      return raw?.report_json || raw;
    } catch (e) {
      attempts.push(`ERR ${url} :: ${e?.message || e}`);
    }
  }

  // ✅ 어떤 URL들이 어떻게 실패했는지 한 방에 보이게
  throw new Error("report fetch failed\n" + attempts.join("\n"));
}


  // [실행] 초기화
  async function init() {
    const sid = getSidSafe();
    if (!sid) return;

    // 설문 버튼(기존 report.js 유지)
    const surveyBtn = document.getElementById("btnStartSurvey");
if (surveyBtn) {
  surveyBtn.addEventListener("click", (e) => {
    e.preventDefault();

    // ✅ 세션 연계 없이, 일반 설문 링크로만 이동
    const FORM_URL =
      "https://docs.google.com/forms/d/e/1FAIpQLSdYVDquseww9O3hvJgRyYmlZxT0BhZ5e_gxmG8mgFWAbx3a4Q/viewform";

    window.location.href = FORM_URL;
  });
}

    try {
      const data = await fetchReportDataV2(sid);

      // v2 표준 접근
      const voice = data?.voice || {};
      const stages = voice?.stages || voice?.stage_rows || [];
      const profile = voice?.profile || null;
      const metricsCard = voice?.metrics_card || [];

      // v2 요약(있으면)
      applyTopSummary(data);
     const persona = buildPersona(stages, data.survey, data.qeeg, data.insights);

// 메인 타이틀/서브타이틀
const titleEl = $("personaTitle");
const sumEl = $("personaSummary");
if (titleEl) titleEl.textContent = persona.title || "-";
if (sumEl) sumEl.textContent = `${persona.subtitle ? persona.subtitle + " " : ""}${persona.summary || "-"}`;

// 강점 리스트
const strengthList = $("strengthList");
if (strengthList) {
  const strengths = persona.strengths || [];
  strengthList.innerHTML = strengths.map(s => `<li>${s}</li>`).join("");
}

// watchout(있으면)
const watchEl = $("watchoutText");
if (watchEl && persona.watchout) watchEl.textContent = persona.watchout;

      renderMetricsCard(metricsCard);

      // report.js 기존 강점(품질/베이스라인/스테이지/차트)
      if (Array.isArray(stages) && stages.length) {
        updateIndexCardsFallback(stages);

        // 3D 매트릭스: v2에서 내려주면 그걸 우선, 없으면 fallback 계산
        const matrixRows = voice?.matrix_rows || data?.matrix_rows || buildMatrixFallback(stages);
        renderMatrix(matrixRows);

        renderStageTable(stages);

        const q = qualityFrom(stages);
        setBadge($("qualityBadge"), `품질: ${q.label}`, q.kind);
        setBadge(
          $("baselineBadge"),
          hasBaseline(stages) ? "Baseline: 있음" : "Baseline: 없음",
          hasBaseline(stages) ? "good" : "warn"
        );

        const qeegCnt = data?.qeeg?.upload_cnt || 0;
        const qeegBox = $("qeegBox");
        if (qeegBox) qeegBox.textContent = qeegCnt > 0 ? `qEEG 데이터 포함 (${qeegCnt}건)` : "qEEG 미업로드";

        drawChart(stages);
      } else {
        // stages 없을 때 최소 메시지
        const titleEl = $("personaTitle");
        const sumEl = $("personaSummary");
        if (titleEl) titleEl.textContent = titleEl.textContent || "데이터 분석 중...";
        if (sumEl) sumEl.textContent = sumEl.textContent || "분석을 위한 음성 세션 데이터가 아직 부족합니다.";
        setBadge($("qualityBadge"), "품질: 데이터 없음", "warn");
        setBadge($("baselineBadge"), "Baseline: 데이터 없음", "warn");
      }
    } catch (err) {
      console.error("데이터 로드 중 에러:", err);
      const titleEl = $("personaTitle");
      if (titleEl) titleEl.textContent = "데이터 로드 실패";
      setBadge($("qualityBadge"), "품질: 로드 실패", "bad");
      setBadge($("baselineBadge"), "Baseline: 로드 실패", "bad");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
