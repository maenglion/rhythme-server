// ./voice-ui.js

export function setQuestionText(text) {
  const el = document.querySelector("#question");
  if (el) el.innerText = text ?? "";
}

export function setDescriptionText(text) {
  const el = document.querySelector("#desc");
  if (el) el.textContent = text ?? "";
}

export function setTimer(leftMs, totalSec = 40) {
  const timerText = document.querySelector("#timer");
  const timerCircle = document.querySelector("#timerLine");
  if (!timerText) return;

  const left = Math.ceil(leftMs / 1000);
  timerText.textContent = `${left}s`;

  if (timerCircle) {
    // 너 SVG 값에 맞춰서 (index.html: 283 / voice_test.html: 502) 중 하나 쓰면 됨
    const CIRC = timerCircle.getAttribute("stroke-dasharray")
      ? Number(timerCircle.getAttribute("stroke-dasharray"))
      : 502;

    const progress = leftMs / (totalSec * 1000);
    const offset = CIRC - (progress * CIRC);

    timerCircle.style.strokeDashoffset = String(offset);
    timerCircle.style.strokeWidth = String(1 + (progress * 3));
  }
}

export function setRecordButtonState({ recording, calibrating }) {
    const btn = document.getElementById('recordBtn');
    const icon = document.getElementById('recordIcon');
    const status = document.getElementById('recordStatus');
    const timerLine = document.getElementById('timerLine');

    if (calibrating) {
        status.innerText = "소음 측정 중...";
        icon.style.borderRadius = "4px"; // 사각형(Stop 아이콘 느낌)
        icon.style.background = "#BB86FC"; // 보라색으로 변경
        icon.style.borderRadius = "50%";
        return;
    }

    if (recording) {
        status.innerText = "녹음 중";
        status.style.color = "#BB86FC"; // 글씨도 보라색으로 강조
        icon.style.background = "#BB86FC"; // 보라색
        icon.style.borderRadius = "4px"; // 사각형(Stop 아이콘 느낌)
        timerLine.style.stroke = "#BB86FC";
    } else {
        status.innerText = "녹음 시작";
        status.style.color = "#fff";
        icon.style.borderRadius = "4px"; // 사각형(Stop 아이콘 느낌)
        icon.style.background = "#dc6363ff"; // 다시 빨간색 원으로
        icon.style.borderRadius = "50%";
    }
}

export function initStageUI() {
  // 기본 상태: 녹음 전
  setRecordButtonState({ recording: false, calibrating: false });

  // 타이머 UI 초기화(원하면)
  // setTimer(40_000, 40);
}