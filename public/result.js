(function () {
    const API_BASE = "https://rhythme-server-as3ud42lpa-du.a.run.app";
    const $ = (id) => document.getElementById(id);

    // [인사이트 사전] 페르소나별 강점 매핑
    const STRENGTHS_MAP = {
        'PRECISION_TURBO': ['압도적인 정보 처리 속도', '고부하 상황에서의 냉철한 통제력', '정교한 논리 구조화'],
        'OVERCLOCK_BOTTLENECK': ['사고 속도가 발화를 앞지름', '역동적인 에너지', '빠른 상황 판단'],
        'LOAD_ACCUMULATION': ['신중한 데이터 검토', '단계적 사고 구조', '높은 정밀도'],
        'PROSODY_SENSITIVE': ['섬세한 감각 인지', '풍부한 공감 채널', '맥락 파악 능력'],
        'STEADY_ARCHITECT': ['안정적인 일관성', '높은 신뢰도', '균형 잡힌 정보 전달']
    };

    async function init() {
        // 1. 세션 ID 가져오기 (테스트용 고정값 포함)
        const params = new URLSearchParams(location.search);
        const sid = params.get("sid") || "865e88b7-db30-43f1-bee4-903a62d96341";
        console.log("📱 Mobile Report Init - SID:", sid);

        try {
            const res = await fetch(`${API_BASE}/report-data-v2?sid=${sid}`);
            const rawData = await res.json();
            const data = rawData.report_json || rawData;
            const voice = data.voice || {};
            const profile = voice.profile || {};
            const stages = voice.stages || [];

            // 2. [상단] 한 줄 페르소나 및 요약 매핑
            if ($("personaTitle")) $("personaTitle").textContent = profile.type_name || "데이터 분석 중";
            if ($("personaSummary")) $("personaSummary").textContent = profile.summary || "충분한 발화 데이터가 확보되면 분석 결과가 표시됩니다.";

            // 3. [상단] 핵심 3대 지표 카드 (캡처 기반 로직)
            if (stages.length >= 2) {
                const sorted = [...stages].sort((a, b) => a.stage_id - b.stage_id);
                const first = sorted[0];
                const last = sorted[sorted.length - 1];
                const s3 = sorted.find(s => s.stage_id === 3);
                const s4 = sorted.find(s => s.stage_id === 4);

                // 인지 적응도
                if ($("index-adaptive")) 
                    $("index-adaptive").textContent = (first.pause_ratio - last.pause_ratio) > 0.02 ? "높음" : "보통";
                
                // 에너지 밀도 (사용자님의 강점 포인트: 9.44 반영)
                const densityVal = last.pitch_sd / (last.speech_rate || 1);
                if ($("index-energy")) 
                    $("index-energy").textContent = densityVal > 8.5 ? "우수" : "보통";
                
                // 회복 탄력성
                if ($("index-resilience")) 
                    $("index-resilience").textContent = ((s4?.speech_rate || 0) - (s3?.speech_rate || 0)) >= -0.1 ? "안정" : "관찰";
            }

            // 4. [중간] 핵심 지표 표 (metrics_card)
            // DB에서 생성된 metrics_card가 있다면 그대로 사용, 없으면 직접 매핑
            if ($("metricsBody")) {
                if (voice.metrics_card) {
                    $("metricsBody").innerHTML = voice.metrics_card.map(m => `
                        <tr>
                            <td style="font-size:14px; color:var(--muted)">${m.label.replace('Last ', '')}</td>
                            <td class="val-col">${m.value}</td>
                            <td class="desc-col">${m.interpretation}</td>
                        </tr>
                    `).join("");
                } else {
                    // Fallback: 직접 매핑 (캡처 데이터 기준)
                    const last = stages[stages.length - 1];
                    const density = (last.pitch_sd / last.speech_rate).toFixed(2);
                    $("metricsBody").innerHTML = `
                        <tr>
                            <td style="font-size:14px; color:var(--muted)">Speech Rate</td>
                            <td class="val-col">${last.speech_rate.toFixed(2)}</td>
                            <td class="desc-col">성인 평균 대비 매우 빠른 사고 처리 속도</td>
                        </tr>
                        <tr>
                            <td style="font-size:14px; color:var(--muted)">Pause Ratio</td>
                            <td class="val-col">${last.pause_ratio.toFixed(3)}</td>
                            <td class="desc-col">고속 처리 중에도 끊김 없는 유창성 유지</td>
                        </tr>
                        <tr>
                            <td style="font-size:14px; color:var(--muted)">Density</td>
                            <td class="val-col">${density}</td>
                            <td class="desc-col">발화 내 에너지 응집도가 매우 높음</td>
                        </tr>
                    `;
                }
            }

            // 5. [하단] 그래프 그리기
            if (stages.length > 0 && typeof drawChart === 'function') {
                drawChart(stages);
            }

        } catch (err) {
            console.error("❌ Mobile Report Error:", err);
            if ($("personaTitle")) $("personaTitle").textContent = "데이터 로드 실패";
        }
    }

    // 문서 로드 완료 시 실행
    document.addEventListener("DOMContentLoaded", init);
})();