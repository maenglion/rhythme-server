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
    const status = document.getElementById('recordStatus');
    const calib = document.getElementById('calibratingText');
    const finishBtn = document.getElementById('finishBtn');

    // 1. 소음 측정 상태
    if (calibrating) {
        calib.style.visibility = "visible";
        status.innerText = "준비 중...";
        status.style.color = "#BB86FC";
        return;
    } else {
        calib.style.visibility = "hidden";
    }

    // 2. 녹음 상태 (녹음 중일 때와 시작 전의 디자인을 보라색 톤으로 통일)
    if (recording) {
        status.innerText = "녹음 중";
        status.style.color = "#BB86FC"; // 굵은 보라색
        if (finishBtn) finishBtn.style.display = 'block';
    } else {
        // 3. 녹음 시작 전 (빨간색이 싫으시다면 여기도 보라색이나 흰색으로 추천!)
        status.innerText = "녹음 시작";
        status.style.color = "#BB86FC"; // 녹음 중과 똑같은 보라색 테마로 통일
        if (finishBtn) finishBtn.style.display = 'none';
    }
}