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

    // 1. 소음 측정 중일 때
    if (calibrating) {
        calib.style.visibility = "visible"; // 연한 글씨 등장
        status.innerText = "준비 중...";
        status.style.color = "#BB86FC";
        if (finishBtn) finishBtn.style.display = 'none';
        return;
    } 

    // 2. 녹음 중일 때
    if (recording) {
        calib.style.visibility = "hidden"; // 소음 측정 글씨는 숨김
        status.innerText = "녹음 중";
        status.style.color = "#BB86FC"; // 굵은 보라
        if (finishBtn) finishBtn.style.display = 'block'; // '다 말했어요' 등장
    } 
    // 3. 대기 상태일 때
    else {
        calib.style.visibility = "hidden";
        status.innerText = "녹음 시작";
        status.style.color = "#FF4444"; // 굵은 빨강
        if (finishBtn) finishBtn.style.display = 'none';
    }
}