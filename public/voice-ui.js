// /js/voice-ui.js
// 1. PDF 원문 지문 데이터 (수정 금지 원칙 준수)
const STAGE_CONTENT = {
    1: {
        question: `지금 나는 내 음성에 귀를 기울이고 있다.
글을 소리 내어 읽을 때는 세 가지를 지킨다:
첫째, 쉼표에서는 잠깐 쉰다. 둘째, 마침표에서는 숨을 고른다. 셋째, 눈은 글을 따라 천천히 내려간다
매일 저녁 나는 오늘 있었던 일들을 체크한다.
그 과정을 통해 숫자들과 친숙한 단어, 가끔은 낯선 단어들이 나의 하루에 녹아있다.
09:30, 12:10, 18:45
기준, 예외, 패턴, 규칙
기쁨, 아쉬움, 안도
왜곡, 의외성, 잡념
급하게 말하지 않고, 틀려도 괜찮다. 틀린 곳부터 다시 이어서 읽는다.
끝까지 읽고 시간이 남으면 처음부터 다시 읽는다.`,
        desc: "위 지문을 편안하게 소리 내어 읽어주세요. (Baseline 측정)"
    },
    // Stage 2~4는 app.js에서 나이(isMinor)에 따라 텍스트를 골라 setQuestionText로 넘겨줄 예정
};

export function initStageUI(stageNum) {
    if (stageNum === 1) {
        setQuestionText(STAGE_CONTENT[1].question);
        setDescriptionText(STAGE_CONTENT[1].desc);
    }
    // 타이머 초기화 (40s)
    setTimer(40000); 
}

export function setQuestionText(text) {
    document.querySelector("#question").innerText = text; // textContent보다 줄바꿈 보존에 유리
}

export function setDescriptionText(text) {
    const el = document.querySelector("#desc");
    if (!el) return;
    el.textContent = text ?? "";
}

export function setTimer(leftMs, totalSec = 40) {
    const timerText = document.querySelector("#timer");
    const timerCircle = document.querySelector("#timerLine"); // SVG의 circle 요소
    
    if (!timerText) return;
    const left = Math.ceil(leftMs / 1000);
    timerText.textContent = `${left}s`;

    if (timerCircle) {
        // 283은 r=45일 때의 둘레 (2 * PI * 45)
        const progress = leftMs / (totalSec * 1000);
        const offset = 283 - (progress * 283);
        timerCircle.style.strokeDashoffset = offset;
        
        // 보라색 선 두께가 4px에서 1px로 점점 얇아지는 효과
        timerCircle.style.strokeWidth = 1 + (progress * 3);
    }
}

export function setRecordButtonState({ recording, calibrating = false }) {
    const btn = document.querySelector("#recordBtn");
    const icon = document.querySelector("#recordIcon");

    if (calibrating) {
        btn.textContent = "소음 측정 중...";
        btn.disabled = true;
        btn.dataset.recording = "0"; // ✅ 추가 (안전)
        return;
    }

    btn.disabled = false;
    btn.textContent = recording ? "중단하기" : "녹음 시작";
    btn.classList.toggle("recording", recording);

    btn.dataset.recording = recording ? "1" : "0"; // ✅ 이 한 줄이 핵심
    
    // UI 아이콘 변경 (원 -> 사각형)
    if (icon) {
        icon.style.borderRadius = recording ? "4px" : "50%";
    }
}

export function setNextEnabled(enabled) {
  const btn = document.querySelector("#nextBtn");
  if (btn) btn.disabled = !enabled;
}
