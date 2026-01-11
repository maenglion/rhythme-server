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

export function setRecordButtonState({ recording, calibrating = false }) {
  const btn = document.querySelector("#recordBtn");
  const icon = document.querySelector("#recordIcon");
  if (!btn) return;

  if (calibrating) {
    btn.disabled = true;
    btn.dataset.recording = "0";
    btn.textContent = "소음 측정 중...";
    return;
  }

  btn.disabled = false;
  btn.dataset.recording = recording ? "1" : "0"; // ✅ 이게 핵심(상태 꼬임 방지)

  // 버튼 텍스트/아이콘
  const label = btn.querySelector("span") || btn;
  if (label) label.textContent = recording ? "중단하기" : "녹음 시작";
  btn.classList.toggle("recording", !!recording);

  if (icon) icon.style.borderRadius = recording ? "4px" : "50%";
}

export function initStageUI() {
  // 기본 상태: 녹음 전
  setRecordButtonState({ recording: false, calibrating: false });

  // 타이머 UI 초기화(원하면)
  // setTimer(40_000, 40);
}