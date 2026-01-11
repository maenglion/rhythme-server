// ./voice-ui.js

export function setQuestionText(text) {
  const el = document.querySelector("#question");
  if (el) el.innerHTML = text ?? ""; // <br> 태그 반영을 위해 innerHTML 권장
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
    const CIRC = 502; // stroke-dasharray 값에 맞춤
    const progress = leftMs / (totalSec * 1000);
    const offset = CIRC - (progress * CIRC);

    timerCircle.style.strokeDashoffset = String(offset);
  }
}

export function setRecordButtonState({ recording, calibrating }) {
  const status = document.getElementById('recordStatus');
  const circle = document.getElementById('recordCircle');
  const calib = document.getElementById('calibratingText');
  const finishBtn = document.getElementById('finishBtn');
  const recordBtn = document.getElementById('recordBtn');

  if (!status || !circle || !calib) return;

  if (calibrating) {
    calib.style.visibility = "visible";
    circle.style.visibility = "hidden"; // display:none 대신 visibility 사용 (영역 유지)
    status.innerText = "준비 중...";
    status.style.color = "#BB86FC";
    if (recordBtn) recordBtn.style.pointerEvents = "none"; // 측정 중 중복 클릭 방지
    return;
  }

  if (recording) {
    calib.style.visibility = "hidden";
    circle.style.visibility = "hidden"; 
    status.innerText = "녹음 중";
    status.style.color = "#BB86FC";
    status.style.fontWeight = "900";
    if (finishBtn) finishBtn.style.display = 'block';
    if (recordBtn) recordBtn.style.pointerEvents = "none"; // 녹음 중엔 중단은 아래 버튼으로
  } else {
    calib.style.visibility = "hidden";
    circle.style.visibility = "visible"; // 다시 빨간 원 등장
    status.innerText = "녹음 시작";
    status.style.color = "#fff";
    status.style.fontWeight = "900";
    if (finishBtn) finishBtn.style.display = 'none';
    if (recordBtn) recordBtn.style.pointerEvents = "auto"; // 클릭 가능하게 복구
  }
}

export function initStageUI() {
  // 초기 UI 세팅
  setRecordButtonState({ recording: false, calibrating: false });
  
  // 혹시 모르니 타이머도 40s로 초기화
  const timerText = document.querySelector("#timer");
  if(timerText) timerText.textContent = "40s";
  
  const timerCircle = document.querySelector("#timerLine");
  if(timerCircle) timerCircle.style.strokeDashoffset = "0";
}