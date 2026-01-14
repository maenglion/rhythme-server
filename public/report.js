// report.js
const API_BASE = "https://rhythme-server-357918245340.asia-northeast3.run.app";
const apiUrl = (path) => {
  const base = API_BASE.endsWith("/") ? API_BASE : API_BASE + "/";
  const clean = String(path || "").replace(/^\//, "");
  return new URL(clean, base).toString();
};

function getSidSoft() {
  return new URLSearchParams(location.search).get("sid")
    || localStorage.getItem("SESSION_ID")
    || window.SESSION_ID
    || null;
}

async function fetchFirstOk(candidates) {
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) continue;
      return await res.json();
    } catch (_) {}
  }
  return null;
}

function fmtDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} `
    + `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// 아주 가벼운 “취미용” confidence (나중에 너가 교체)
function computeConfidenceToy(sq100, stages) {
  // 시스템화 질문에서 pause_ratio가 안정적이고, 붕괴에서 변동이 있으면 “일치” 쪽으로 가산하는 식의 장난감
  if (!Array.isArray(stages) || stages.length === 0) return 50;

  const s1 = stages.find(x => x.stage_id == 1) || stages[0];
  const s2 = stages.find(x => x.stage_id == 2) || stages[1] || s1;
  const s3 = stages.find(x => x.stage_id == 3) || stages[2] || s2;
  const s4 = stages.find(x => x.stage_id == 4) || stages[3] || s3;

  const stable = 1 - clamp01(Math.abs((s2.pause_ratio ?? 0) - (s1.pause_ratio ?? 0)) / 0.4);
  const shift = clamp01(Math.abs((s3.pause_ratio ?? 0) - (s2.pause_ratio ?? 0)) / 0.5); // 붕괴에서 변화가 있으면 “반응성” 점수
  const sqNorm = clamp01((sq100 ?? 50) / 100);

  // 그냥 보기좋게 섞음(나중에 교체)
  const raw = 0.45*sqNorm + 0.35*stable + 0.20*shift;
  return Math.round(raw * 100);
}

function voiceQualityToy(stages) {
  // snr_est_db 평균과 clipping_ratio로 대충 점수
  if (!Array.isArray(stages) || stages.length === 0) return { label: "-", score: 0 };

  const snr = stages.map(s => Number(s.snr_est_db ?? 0)).filter(n => !Number.isNaN(n));
  const clip = stages.map(s => Number(s.clipping_ratio ?? 0)).filter(n => !Number.isNaN(n));

  const snrAvg = snr.length ? snr.reduce((a,b)=>a+b,0)/snr.length : 0;
  const clipAvg = clip.length ? clip.reduce((a,b)=>a+b,0)/clip.length : 0;

  // 대충 스케일링
  const snrScore = clamp01((snrAvg + 5) / 20);        // -5~15db 정도 가정
  const clipPenalty = clamp01(clipAvg / 0.05);        // 5% 이상이면 페널티
  const score = Math.round(100 * (0.75*snrScore + 0.25*(1-clipPenalty)));

  const label = score >= 75 ? "좋음" : score >= 55 ? "보통" : "주의";
  return { label, score };
}

function buildInsightTitle({ sq100, confidence }) {
  // 너가 원하는 “인간 리터러시 번역” 톤(베타용)
  if (sq100 >= 70 && confidence >= 70) return "당신은 ‘구조를 세우며 몰입하는 탐구자’ 타입입니다.";
  if (sq100 >= 70 && confidence < 70)  return "설문은 높지만, 상황에 따라 음성 반응이 달라지는 타입입니다.";
  if (sq100 < 45 && confidence >= 70)  return "즉흥·유연성이 강하게 드러나는 타입입니다.";
  return "당신의 패턴은 한쪽으로 고정되지 않고 ‘상황 적응형’에 가깝습니다.";
}

function buildMatrixRows({ sq100, stages }) {
  // stages 기반으로 근거 문구 만들기(간단 버전)
  const s2 = stages?.find(x => x.stage_id == 2) || stages?.[1] || {};
  const s3 = stages?.find(x => x.stage_id == 3) || stages?.[2] || {};
  const pause = (v)=> (typeof v === "number" ? v.toFixed(2) : "-");
  const rate = (v)=> (typeof v === "number" ? v.toFixed(2) : "-");
  const pitch = (v)=> (typeof v === "number" ? v.toFixed(2) : "-");

  return [
    {
      axis: "인지적 정밀도",
      evidence: `SQ ${sq100}/100 ↔ pause ${pause(s2.pause_ratio)} / rate ${rate(s2.speech_rate)}`,
      meaning: "논리 질문(Stage 2)에서 말의 리듬/휴지 패턴이 얼마나 일정하게 유지되는지로 ‘정밀도’를 추정합니다."
    },
    {
      axis: "에너지·몰입도",
      evidence: `pitch SD ${pitch(s2.pitch_sd)} (Stage2) vs ${pitch(s4?.pitch_sd)} (Stage4)`,
      meaning: "특정 주제에서 억양 변동이 커지면(또는 작아지면) 몰입 방식의 힌트가 됩니다."
    },
    {
      axis: "붕괴 대응",
      evidence: `Stage2→3 변화: pause ${pause(s2.pause_ratio)} → ${pause(s3.pause_ratio)}`,
      meaning: "루틴/계획이 깨지는 상황(Stage 3)에서 리듬이 얼마나 흔들리는지로 회복 방식의 힌트를 봅니다."
    }
  ];
}

function makeSparklineSVG(values, labels) {
  // values: number[] (0~1 권장)
  const w = 520, h = 120, pad = 14;
  const pts = values.map((v, i) => {
    const x = pad + (i * ((w - pad*2) / Math.max(1, values.length - 1)));
    const y = (h - pad) - (v * (h - pad*2));
    return [x, y];
  });

  const poly = pts.map(p => p.join(",")).join(" ");
  const dots = pts.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4" fill="rgba(187,134,252,0.95)"></circle>`).join("");

  const xlabels = labels.map((t,i) => {
    const x = pad + (i * ((w - pad*2) / Math.max(1, labels.length - 1)));
    return `<text x="${x}" y="${h-2}" font-size="11" text-anchor="middle" fill="rgba(255,255,255,0.55)">${t}</text>`;
  }).join("");

  return `
  <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="sparkline">
    <polyline points="${poly}" fill="none" stroke="rgba(187,134,252,0.85)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${dots}
    ${xlabels}
  </svg>`;
}

function normRange(values) {
  const nums = values.map(v => (typeof v === "number" ? v : null)).filter(v => v !== null);
  if (!nums.length) return { norm: values.map(_=>0), min:0, max:1 };
  const min = Math.min(...nums), max = Math.max(...nums);
  const norm = values.map(v => {
    if (typeof v !== "number") return 0;
    if (max === min) return 0.5;
    return (v - min) / (max - min);
  });
  return { norm, min, max };
}

document.addEventListener("DOMContentLoaded", async () => {
  const sid = getSidSoft();
  document.getElementById("sidText").textContent = sid || "-";
  document.getElementById("createdAt").textContent = fmtDate(Date.now());

  const age = parseInt(localStorage.getItem("rhythmi_age") || "0", 10);
  if (age > 0 && age < 14) document.getElementById("under14Warn").style.display = "block";

  if (!sid) {
    document.getElementById("insightTitle").textContent = "세션이 없습니다.";
    document.getElementById("insightDesc").textContent = "처음부터 다시 진행해주세요.";
    return;
  }

  // ✅ 서버 엔드포인트는 네 프로젝트에 맞춰서 여기 후보만 조정하면 됨
  const survey = await fetchFirstOk([
    apiUrl(`/survey?session_id=${encodeURIComponent(sid)}`),
    apiUrl(`/get-survey?session_id=${encodeURIComponent(sid)}`),
    apiUrl(`/result-survey?session_id=${encodeURIComponent(sid)}`),
  ]);

  const voice = await fetchFirstOk([
    apiUrl(`/voice?session_id=${encodeURIComponent(sid)}`),
    apiUrl(`/get-voice?session_id=${encodeURIComponent(sid)}`),
    apiUrl(`/voice-stages?session_id=${encodeURIComponent(sid)}`),
  ]);

  const stages = Array.isArray(voice?.stages) ? voice.stages : (Array.isArray(voice) ? voice : []);
  const sq100 = Number(survey?.total_score ?? localStorage.getItem("rhythmi_sq_score_100") ?? 0) || 0;

  const confidence = computeConfidenceToy(sq100, stages);
  const vq = voiceQualityToy(stages);

  document.getElementById("sqScore").textContent = `${sq100}`;
  document.getElementById("confidence").textContent = `${confidence}`;
  document.getElementById("voiceQuality").textContent = `${vq.label} (${vq.score})`;

  // 인사이트
  const insightTitle = buildInsightTitle({ sq100, confidence });
  document.getElementById("insightTitle").textContent = insightTitle;
  document.getElementById("insightDesc").textContent =
    "설문(SQ), 스테이지별 음성 지표, (선택) qEEG를 통합해 ‘취미/베타’ 수준으로 요약한 인사이트입니다.";

  // 매트릭스
  const rows = buildMatrixRows({ sq100, stages });
  const tb = document.getElementById("matrixBody");
  tb.innerHTML = rows.map(r => `
    <tr>
      <td><b>${r.axis}</b></td>
      <td>${r.evidence}</td>
      <td>${r.meaning}</td>
    </tr>
  `).join("");

  // 그래프: stage1~4 values 추출
  const byStage = [1,2,3,4].map(id => stages.find(s => s.stage_id == id) || null);
  const labels = ["S1","S2","S3","S4"];

  const pauseVals = byStage.map(s => s?.pause_ratio);
  const pitchVals = byStage.map(s => s?.pitch_sd);
  const rateVals  = byStage.map(s => s?.speech_rate);

  const pN = normRange(pauseVals);
  const piN = normRange(pitchVals);
  const rN = normRange(rateVals);

  document.getElementById("chartPause").innerHTML = makeSparklineSVG(pN.norm, labels);
  document.getElementById("chartPitch").innerHTML = makeSparklineSVG(piN.norm, labels);
  document.getElementById("chartRate").innerHTML  = makeSparklineSVG(rN.norm, labels);

  // qEEG 섹션: survey.qeeg_info 안에 files/answers가 들어있으니 “업로드 여부”만 가볍게 감지
  try {
    const qi = survey?.qeeg_info ? JSON.parse(survey.qeeg_info) : null;
    const hasQeeg = !!(qi?.files?.EC || qi?.files?.EO);
    if (hasQeeg) {
      const card = document.getElementById("qeegCard");
      card.style.display = "block";
      document.getElementById("qeegSummary").textContent =
        "qEEG가 업로드되어, 대역파워/비대칭/눈뜸·눈감음 차이 같은 패턴과 음성 지표의 ‘동반 변화(힌트)’를 연구적으로 탐색할 수 있습니다.";
    }
  } catch (_) {}
});
