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

  function applyProfile(profile) {
    if (!profile) return;

    const titleEl = $("personaTitle");
    const sumEl = $("personaSummary");
    if (titleEl && profile.type_name) titleEl.textContent = profile.type_name;
    if (sumEl && profile.summary) sumEl.textContent = profile.summary;

    // (report.html에는 기본적으로 strengthList/watchoutText가 없어서 있으면만 채움)
    const watchEl = $("watchoutText");
    if (watchEl && profile.watchout) watchEl.textContent = profile.watchout;

    const strengthList = $("strengthList");
    if (strengthList) {
      const strengths = STRENGTHS_MAP[profile.type_code] || [];
      if (strengths.length) strengthList.innerHTML = strengths.map((s) => `<li>${s}</li>`).join("");
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


      // v2 표준 접근
      const voice = data?.voice || {};
      const stages = voice?.stages || voice?.stage_rows || [];
      const profile = voice?.profile || null;
      const metricsCard = voice?.metrics_card || [];

      // v2 요약(있으면)
      applyTopSummary(data);
      applyProfile(profile);
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
