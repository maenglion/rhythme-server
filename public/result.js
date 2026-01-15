(function () {
    // 1. 설정: 서버 주소
    const API_BASE = "https://rhythme-server-as3ud42lpa-du.a.run.app";
    const $ = (id) => document.getElementById(id);


    // 2. 강점 데이터 사전
    const STRENGTHS_MAP = {
        'PRECISION_TURBO': ['압도적인 정보 처리 속도', '고부하 상황에서의 냉철한 통제력', '정교한 논리 구조화'],
        'OVERCLOCK_BOTTLENECK': ['사고의 속도가 출력을 앞섬', '역동적인 에너지', '빠른 판단력'],
        'LOAD_ACCUMULATION': ['신중한 검토 능력', '단계적 사고', '데이터 정밀도'],
        'PROSODY_SENSITIVE': ['섬세한 감각 인지', '맥락 파악 능력', '풍부한 공감 채널'],
        'STEADY_ARCHITECT': ['안정적인 일관성', '높은 신뢰도', '균형 잡힌 정보 처리']
    };

    async function init() {
        // URL에서 sid 가져오기 (없으면 테스트용 사용자님 SID 사용)
        const params = new URLSearchParams(location.search);
        const sid = params.get("sid") || "865e88b7-db30-43f1-bee4-903a62d96341";
        
        console.log("🚀 분석 시작 - SID:", sid);

        try {
            // 서버 호출
            const res = await fetch(`${API_BASE}/report-data-v2?sid=${sid}`);
            if (!res.ok) throw new Error("서버 응답 에러");
            
            const rawData = await res.json();
            console.log("📦 서버 원본 데이터 확인:", rawData); // 구조 파악용

            // 데이터 본체 접근 (서버 응답 구조에 따라 대응)
            const data = rawData.report_json || rawData;
            const voice = data.voice || {};
            const profile = voice.profile || {};

            // --- [화면 매핑 시작] ---

            // 1. 상단 요약
            if ($("sqScore")) $("sqScore").textContent = `${data.survey?.total_score || 0}점`;
            
            const qeegCount = data.qeeg?.upload_cnt || 0;
            if ($("qeegStatus")) {
                $("qeegStatus").textContent = qeegCount > 0 ? `✅ 연동 완료 (${qeegCount}건)` : "❌ 미연동";
                if(qeegCount > 0) $("qeegStatus").classList.add("active");
            }

            // 2. 페르소나 메인
            if ($("personaTitle")) $("personaTitle").textContent = profile.type_name || "분석 결과 없음";
            if ($("personaSummary")) $("personaSummary").textContent = profile.summary || "데이터 분석 중입니다.";
            if ($("watchoutText")) $("watchoutText").textContent = profile.watchout || "특이사항 없음";

            // 3. 강점 리스트
            const strengths = STRENGTHS_MAP[profile.type_code] || [];
            if ($("strengthList")) {
                $("strengthList").innerHTML = strengths.map(s => `<li>${s}</li>`).join("");
            }

            // 4. 핵심 지표 표 (metrics_card)
            if ($("metricsBody") && voice.metrics_card) {
                $("metricsBody").innerHTML = voice.metrics_card.map(m => `
                    <tr>
                        <td>${m.label}</td>
                        <td class="val-col">${m.value}</td>
                        <td class="desc-col">${m.interpretation}</td>
                    </tr>
                `).join("");
            }

            console.log("✅ 리포트 생성 완료!");

        } catch (err) {
            console.error("❌ 에러 발생:", err);
            if ($("personaTitle")) $("personaTitle").textContent = "데이터 로드 실패";
        }
    }

    // 문서 로드 완료 시 실행
    document.addEventListener("DOMContentLoaded", init);
})();