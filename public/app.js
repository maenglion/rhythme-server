// 1. 엔진 및 UI 제어 도구 가져오기
import { VoiceProcessor } from "./voice-processor.js";
import { 
    setQuestionText, 
    setDescriptionText, 
    setTimer, 
    setRecordButtonState 
} from "./voice-ui.js";

const vp = new VoiceProcessor();
const CLOUD_RUN_URL = "https://rhythme-server-357918245340.asia-northeast3.run.app";
const API = (path) => `${CLOUD_RUN_URL.replace(/\/$/, '')}${path}`;

const CONSENT_CACHE = {};

/* --- [전역 상태 관리] --- */
let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];
let isUnder14 = false;
let STAGES = [];
let stageIdx = 0;
let stageDisplayTime = 0;

// ===== Modal helpers (index.html의 customModal 사용) =====
window.showModal = function (message) {
  const modal = document.getElementById('customModal');
  const msgEl = document.getElementById('modalMessage');
  const okBtn = document.getElementById('modalOkBtn');
  const cancelBtn = document.getElementById('modalCancelBtn');

  if (!modal || !msgEl || !okBtn) {
    // 모달 DOM이 없으면 최후 fallback
    alert(message);
    return;
  }

  msgEl.textContent = message;

  // confirm 모드가 아닐 때는 cancel 숨김
  if (cancelBtn) cancelBtn.style.display = 'none';

  okBtn.onclick = () => window.closeModal();
  modal.style.display = 'flex';
};

window.closeModal = function () {
  const modal = document.getElementById('customModal');
  if (modal) modal.style.display = 'none';
};

// confirm 대체 (Promise 반환)
window.showConfirmModal = function (message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    const msgEl = document.getElementById('modalMessage');
    const okBtn = document.getElementById('modalOkBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    // fallback
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      resolve(confirm(message));
      return;
    }

    msgEl.textContent = message;
cancelBtn.style.display = 'inline-block';

    okBtn.onclick = () => {
      window.closeModal();
      resolve(true);
    };
    cancelBtn.onclick = () => {
      window.closeModal();
      resolve(false);
    };

    modal.style.display = 'flex';
  });
};

// 2. 토글 함수 수정
window.loadAndToggleConsent = async function (path, headerEl) {
  const item = headerEl.closest(".consent-item");
  if (!item) return;

  const contentEl = item.querySelector(".consent-content");
  const textArea = item.querySelector(".consent-text-area");
  const arrow = headerEl.querySelector(".arrow");

  if (!contentEl || !textArea) return;

  const isActive = item.classList.contains("active");

  if (isActive) {
    item.classList.remove("active");
    contentEl.style.display = "none"; 
    if (arrow) arrow.textContent = "▼";
    return;
  }

  try {

    if (!CONSENT_CACHE[path]) {
      textArea.textContent = "내용을 불러오는 중...";
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      CONSENT_CACHE[path] = await res.text();
    }
    textArea.textContent = CONSENT_CACHE[path];
  } catch (e) {
    console.error(e);
    textArea.textContent = "약관 내용을 불러오지 못했습니다.";
  }

  item.classList.add("active");

  contentEl.style.display = "block"; 
  if (arrow) arrow.textContent = "▲";
};


// 세션 아이디 
window.SESSION_ID = window.SESSION_ID || crypto.randomUUID();

// 1. 연구용 실제 문항 배열 (참여자에게는 괄호 안의 내부 지표를 숨기고 텍스트만 노출)
const childQuestions = [
    "설명서를 끝까지 보지 않아도 다음에 무엇을 해야 할지 스스로 유추한다.",
    "물건이나 환경의 배치가 왜 그렇게 되어 있는지 자주 질문하거나 설명한다.",
    "장난감, 기계, 프로그램의 작동 원리가 궁금해 분해하거나 직접 만들어 보려 한다.",
    "기계나 앱, 게임에서 이것저것 눌러보며 작동 원리를 빠르게 파악한다.",
    "이야기나 영상에서 등장인물의 감정보다 세계관의 규칙·설정·작동 방식에 더 집중한다.",
    "가상의 이야기보다 사실 기반 콘텐츠(다큐, 과학·역사)에서 원인과 구조를 찾는 것을 즐긴다.",
    "동물·사물·사람 등에서 차이점과 공통점을 스스로 분류하려 한다.",
    "숫자, 규칙, 퍼즐처럼 명확한 규칙이 있는 문제를 이해하고 푸는 것을 좋아한다.",
    "관심 있는 주제(공룡, 우주, 기차 등)가 생기면 종류와 특징을 끝까지 파고든다.",
    "문제가 생기면 감정을 나누기보다 지금 할 수 있는 행동과 다음 단계를 먼저 생각한다."
];

const adultQuestions = [
    "처음 가보는 복잡한 환승역이나 지하철 노선도를 볼 때, 전체 구조가 머릿속에 재구성된다.",
    "어떤 선택을 할 때, 감정적 평가보다 지표 간의 관계(효율, 시간 비용 등)를 먼저 본다.",
    "외국어를 배울 때 문장을 외우기보다 문법 규칙이 변형되는 구조를 파악하는 것이 편하다.",
    "도로 정체가 발생하면 사고 유무, 신호 주기 등 원인을 추론하려 한다.",
    "새로운 기기 사용 시 설명서 없이 이것저것 눌러보며 내부 동작 논리를 파악한다.",
    "일반 물건보다 전자기기처럼 고관여 상품의 상세 사양(Spec) 비교에서 즐거움을 느낀다.",
    "주변 사람들의 감정 변화보다 시스템의 오류나 논리적 불일치를 더 빨리 발견한다.",
    "무언가 고장 났을 때 어떤 하위 요소에서 오류가 시작됐는지 단계별로 떠올린다.",
    "복잡한 데이터나 정보에서 남들이 보지 못하는 반복 규칙이나 사이클을 찾는 것이 즐겁다.",
    "나의 신체리듬을 데이터화하고 컨디션을 최적화하는 시스템적인 방법을 구상해본다."
];

/* ============================================================
   1. 공통 및 단계 이동 제어 (window 등록 필수)
   ============================================================ */
window.nextStep = function() {
    const prev = document.getElementById(`step${currentStep}`);
    if (prev) prev.classList.remove('active');
    currentStep++;
    const next = document.getElementById(`step${currentStep}`);
    if (next) {
        next.classList.add('active');
        window.scrollTo(0, 0);
    }
    if (currentStep === 4) renderQuestion();
};

window.showModal = function(msg) {
    const modal = document.getElementById('customModal');
    if (modal) {
        document.getElementById('modalMessage').innerText = msg;
        modal.style.display = 'flex';
    } else { alert(msg); }
};

window.closeModal = function() {
    const modal = document.getElementById('customModal');
    if (modal) modal.style.display = 'none';
};


// app.js 상단
window.checkAndGo = function() {
    // 'essential' 클래스가 붙은 체크박스만 검사
    const essentials = document.querySelectorAll('.essential');
    let allChecked = true;

    essentials.forEach(checkbox => {
        // 부모 요소가 숨겨져 있지 않은 경우에만 체크 여부 확인 (미성년자 동의 로직 대응)
        if (checkbox.offsetParent !== null && !checkbox.checked) {
            allChecked = false;
        }
    });

    if (allChecked) {
        location.href = 'voice_info.html';
    } else {
        window.showModal("필수 항목에 모두 동의해 주세요.");
    }
};
// 그 다음에 loadAndToggleConsent 등 다른 함수들...


/* ============================================================
   2. Step 1~3: 인트로, 동의, 정보 입력
   ============================================================ */
window.startResearch = function(under14) {
    isUnder14 = under14;
    const parentalBox = document.getElementById('parentalConsentItem');
    const parentalCheckbox = document.getElementById('checkParent');
    if (parentalBox && parentalCheckbox) {
        if (isUnder14) {
            parentalBox.style.display = 'block';
            parentalCheckbox.classList.add('essential');
        } else {
            parentalBox.style.display = 'none';
            parentalCheckbox.classList.remove('essential');
        }
    }
    window.nextStep();
};

window.loadAndToggleConsent = async function(path, headerElement) {
    const item = headerElement.closest('.consent-item');
    const textArea = item.querySelector('.consent-text-area');

    // 1. 이미 열려있으면 닫기만 하고 종료
    if (item.classList.contains('active')) {
        item.classList.remove('active');
        return;
    }

    // 2. 다른 열려있는 항목 닫기 (선택 사항)
    document.querySelectorAll('.consent-item').forEach(el => el.classList.remove('active'));

    // 3. ⭐️ 핵심: 캐시에 데이터가 없으면 서버에서 직접 가져오기
    try {
        if (!CONSENT_CACHE[path]) {
            textArea.textContent = "내용을 불러오는 중...";
            const response = await fetch(path); // 'terms-of-use/personal.txt' 경로로 요청
            if (!response.ok) throw new Error("파일을 찾을 수 없습니다.");
            
            const text = await response.text();
            CONSENT_CACHE[path] = text; // 가져온 내용을 냉장고(캐시)에 저장
        }
        
        // 4. 화면에 뿌려주기
        textArea.innerText = CONSENT_CACHE[path]; 
    } catch (error) {
        console.error("약관 로드 실패:", error);
        textArea.innerText = "약관 내용을 불러오지 못했습니다. 경로를 확인해주세요.";
    }

    // 5. 화면에 보이기
    item.classList.add('active');
};

window.toggleDiagnosis = function(element, value) {
    element.classList.toggle('selected');
    const index = diagnoses.indexOf(value);
    if (index > -1) diagnoses.splice(index, 1);
    else diagnoses.push(value);
};

window.validateStep3 = function() {
    const ageVal = document.getElementById('age').value;
    const nickVal = document.getElementById('nickname').value.trim();
    const pinVal = document.getElementById('userPin').value;
    const age = parseInt(ageVal);

    if (!nickVal || nickVal.length < 2) { window.showModal("닉네임을 2자 이상 입력해주세요."); return; }
    if (pinVal.length !== 4) { window.showModal("PIN 4자리를 입력해주세요."); return; }
    if (!ageVal || isNaN(age)) { window.showModal("나이를 입력해주세요."); return; }
    if ((!isUnder14 && age < 14) || (isUnder14 && age >= 14)) {
        window.showModal("⚠️ 선택하신 참여 유형과 실제 나이가 일치하지 않습니다.");
        return;
    }
    window.nextStep();
};

/* ============================================================
   3. Step 4~5: 설문 및 qEEG 업로드
   ============================================================ */
function renderQuestion() {
    const age = parseInt(document.getElementById('age').value);
    const questions = (age < 19) ? childQuestions : adultQuestions;
    if (currentQIndex >= questions.length) { window.nextStep(); return; }

    document.querySelectorAll('.ans-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('questionText').innerText = questions[currentQIndex];
    const progress = ((currentQIndex + 1) / questions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('questionCount').innerText = `${currentQIndex + 1} / ${questions.length}`;
}

window.handleAnswer = function(val, evt) {
    // 1. 이벤트 객체와 타겟 요소 가드
    const el = evt?.currentTarget;
    if (!el) return;

    // 2. 시각적 피드백
    document.querySelectorAll('.ans-btn').forEach(btn => btn.classList.remove('selected'));
    el.classList.add('selected');

    // 3. 데이터 기록 및 다음 문항
    setTimeout(() => {
        answers.push(val);
        currentQIndex++;
        renderQuestion();
    }, 250); 
};

window.updateFileName = function(type) {
    const fileInput = document.getElementById(`qeeg${type}`);
    const statusDisplay = document.getElementById(`${type.toLowerCase()}Status`);
    if (fileInput.files.length > 0) {
        statusDisplay.innerText = fileInput.files[0].name;
        statusDisplay.classList.add('status-active');
    } else {
        statusDisplay.innerText = "미첨부";
        statusDisplay.classList.remove('status-active');
    }
};

/* ============================================================
   최종 데이터 제출 (qEEG 정보 + 설문 점수 + S-Tag 포함)
   ============================================================ */
window.getSTag = function(score) {
  if (score >= 24) return "Extreme S";
  if (score >= 18) return "High S";
  if (score >= 12) return "Average S";
  return "Low S";
};


window.submitAll = async function(evt) {
  const ecFile = document.getElementById('qeegEC')?.files[0];
  const eoFile = document.getElementById('qeegEO')?.files[0];
  const nickname = document.getElementById('nickname').value;
  const age = document.getElementById('age').value;
  const genderElem = document.querySelector('input[name="gender"]:checked');
  const gender = genderElem ? genderElem.value : 'unknown';
  const isChild = parseInt(age) <= 18;

  const currentBtn = evt?.currentTarget;
  if (currentBtn) {
    currentBtn.disabled = true;
    currentBtn.innerText = "데이터 분석중...";
  }

 if (!ecFile || !eoFile) {
  const confirmGo = await window.showConfirmModal(
    "⚠️ qEEG 파일이 선택되지 않았습니다.\n\n파일 없이 진행할까요?"
  );

  if (!confirmGo) {
    if (currentBtn) {
      currentBtn.disabled = false;
      currentBtn.innerText = "음성분석 시작";
    }
    return;
  }
}


if (answers.length !== 10) {
  window.showModal("설문이 완료되지 않았습니다.");
  if (currentBtn) { currentBtn.disabled = false; currentBtn.innerText = "음성분석 시작"; }
  return;
}


  const totalScore = answers.reduce((a,b)=>a+b,0);
  const sTag = window.getSTag(totalScore);
  const surveyPayload = {
    user_id: nickname,
    age: parseInt(age),
    gender,
    is_child: isChild,
    diagnoses: diagnoses.join(', '),
    q1_spatial: answers[0], q2_decision_alg: answers[1], q3_linguistic: answers[2],
    q4_causal: answers[3], q5_reverse_eng: answers[4], q6_decision_adv: answers[5],
    q7_social_pattern: answers[6], q8_error_analysis: answers[7], q9_abstract_pattern: answers[8],
    q10_self_opt: answers[9],
    total_score: totalScore,
    s_tag: sTag,
    qeeg_info: `EC: ${ecFile ? ecFile.name : 'none'}, EO: ${eoFile ? eoFile.name : 'none'}`
  };

  try {
    const surveyRes = await fetch(API('/submit-survey'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(surveyPayload),
});

    if (!surveyRes.ok) {
      const t = await surveyRes.text();
      throw new Error(`submit-survey failed ${surveyRes.status}: ${t}`);
    }

const ecResult = ecFile ? await uploadSingleFile(nickname, 'EC', ecFile) : null;
const eoResult = eoFile ? await uploadSingleFile(nickname, 'EO', eoFile) : null;

window.showModal(
  `✅ 저장 완료\n\nEC: ${ecFile?.name || 'none'}\nEO: ${eoFile?.name || 'none'}`
);

console.log('EC path:', ecResult?.path);
console.log('EO path:', eoResult?.path);

// 버튼은 있으면 숨김 (step5에서 쓰던 것들)
const uploadBtn = document.getElementById('uploadBtn');
if (uploadBtn) uploadBtn.style.display = 'none';

const nextBtn = document.getElementById('nextStepBtn');
if (nextBtn) nextBtn.style.display = 'none';

// ✅ 화면 전환: step5 -> step6
localStorage.setItem('rhythmi_user_id', nickname);
localStorage.setItem('rhythmi_age', String(age));
localStorage.setItem('rhythmi_gender', gender);

// 기존 step6 토글 대신
location.href = 'voice_info.html';


  } catch (error) {
    console.error('Submit Error:', error);
    alert('서버 오류: ' + error.message);
    if (currentBtn) { currentBtn.disabled = false; currentBtn.innerText = "음성분석 시작"; }
  }
};

async function uploadSingleFile(userId, type, file) {
  const formData = new FormData();
  formData.append("user_id", userId);
  formData.append("file_type", type);
  formData.append("file", file);

  const res = await fetch(API("/upload-qeeg"), {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upload-qeeg failed ${res.status}: ${t}`);
  }
  return res.json();
}



/* ============================================================
   4. Step 6~7: 음성 분석 엔진 (핵심)
   ============================================================ */
window.goToVoiceTest = function () {
  const age = parseInt(document.getElementById('age')?.value || '20', 10);

  STAGES = getStages(age);   // ✅ 연령 기반 스테이지 구성
  stageIdx = 0;

  window.nextStep();         // ✅ step6 -> step7 (active 전환)
  renderStage();             // ✅ step7 내용 렌더
};

function getStages(age) {
  const isUnder14 = age < 14;

  return [
    { id: 1, q: "Stage 1", d: "지문을 읽어주세요.", text: "지금 나는 내 음성에 귀를 기울이고 있다..." },
    { id: 2, q: isUnder14 ? "최근에 흥미로운 주제는?" : "최근에 해결한 사례는?", d: "자유롭게 말씀해 주세요." },
  ];
}



/* ============================================================
   [신규 추가] Step 7: 음성 테스트 화면 전용 렌더링 함수
   ============================================================ */

function renderStage() {
  const s = STAGES[stageIdx];

  // ✅ 종료 화면(마지막 stage 끝난 뒤)
  if (!s) {
    const badgeEl = document.getElementById("stageBadge");
    if (badgeEl) badgeEl.innerText = "완료";

    setQuestionText("녹음이 완료되었습니다.");
    setDescriptionText("참여해주셔서 감사합니다.");

    const recBtn = document.getElementById("recordBtn");
    if (recBtn) recBtn.style.display = "none";

    const finishBtn = document.getElementById("finishBtn");
    if (finishBtn) {
      finishBtn.style.display = "inline-block";
      finishBtn.disabled = false;
      finishBtn.innerText = "완료";
      finishBtn.onclick = () => {
        // location.href = "done.html";
      };
    }
    return;
  }

  // ✅ 일반 stage 화면
  const badgeEl = document.getElementById("stageBadge");
  if (badgeEl) badgeEl.innerText = `Stage ${s.id}`;

  setQuestionText(s.text || s.q || "");
  setDescriptionText(s.d || "");

  setTimer(40000);
  setRecordButtonState({ recording: false, calibrating: false });

  const finishBtn = document.getElementById("finishBtn");
  if (finishBtn) finishBtn.style.display = "none";


  const qEl = document.getElementById('question') || document.getElementById('questionText');
  const dEl = document.getElementById('desc') || document.getElementById('descriptionText');


  if (qEl) qEl.innerText = s.text || s.q;
  if (dEl) dEl.innerText = s.d;
  if (badge) badge.innerText = `Stage ${s.id}`;

  stageDisplayTime = performance.now();

  if (typeof setTimer === 'function') setTimer(40000);
  if (typeof setRecordButtonState === 'function') setRecordButtonState({ recording: false });

  const nBtn = document.getElementById('nextBtn');
  if (nBtn) nBtn.style.display = 'none';
}

async function runVoiceStage() {
  const s = STAGES[stageIdx];
  const clickTime = performance.now();

  // ✅ "다 말했어요" 버튼: 여기서만 1번 세팅
  const finishBtn = document.getElementById('finishBtn');
  if (finishBtn) {
    finishBtn.disabled = false;
    finishBtn.innerText = "다 말했어요";

    // 이전 핸들러가 남아있어도 덮어쓰기 됨(중복 방지)
    finishBtn.onclick = () => {
      console.log("다 말했어요 클릭 -> stop()");
      vp.stop();                 // startStage가 "stopped"로 finalize됨
      finishBtn.disabled = true; // 연타 방지
      finishBtn.innerText = "저장 중...";
    };
  }

  setRecordButtonState({ recording: false, calibrating: true });
  const cal = await vp.calibrateSilence(2);

  setRecordButtonState({ recording: true, calibrating: false });
  const metrics = await vp.startStage({
    durationSec: 40,
    onTick: ({ leftMs }) => setTimer(leftMs, 40),
  });

  setRecordButtonState({ recording: false });

  // 녹음이 끝났으면 "다 말했어요" 버튼은 숨김(완료는 renderStage에서 처리)
if (finishBtn) {
  finishBtn.disabled = true;
  finishBtn.style.display = "none";
  finishBtn.onclick = null;
}

  const age = parseInt(document.getElementById('age')?.value || '0', 10);
  const age_group = age < 14 ? "under14" : (age < 19 ? "child" : "adult");

  const payload = {
    session_id: window.SESSION_ID,
    stage_id: s.id,
    age_group,
    status: metrics?.status || "completed",
    start_latency_ms: Math.max(0, Math.floor(clickTime - stageDisplayTime)),
    recorded_ms: metrics?.recorded_ms ?? 40000,
    stop_offset_ms: metrics?.recorded_ms ?? 40000,

    pitch_mean: metrics?.pitch_mean ?? 0,
    pitch_sd: metrics?.pitch_sd ?? 0,
    speech_rate: metrics?.speech_rate ?? 0,
    pause_ratio: metrics?.pause_ratio ?? 0,
    jitter: 0,
    shimmer: 0,

    noise_floor_db: cal?.noise_floor_db ?? null,
    snr_est_db: metrics?.snr_est_db ?? null,
    clipping_ratio: metrics?.clipping_ratio ?? null,
    bg_voice_ratio: metrics?.bg_voice_ratio ?? null,

    time_reading_style: null,
    time_digits_rule: null,
  };

  const res = await fetch(API('/submit-voice-stage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`submit-voice-stage failed ${res.status}: ${t}`);
  }

  stageIdx += 1;
  renderStage();
}


/* ============================================================
   [핵심] 녹음 버튼 이벤트 연결 (이게 있어야 runVoiceStage가 작동함)
   ============================================================ */

function initVoicePage() {
  const recBtn = document.getElementById("recordBtn");
  if (!recBtn) return; // ✅ 음성 페이지 아니면 아무 것도 안 함 (경고도 없음)

  recBtn.addEventListener("click", async () => {
    if (recBtn.dataset.recording === "1") {
      console.log("녹음 중단 요청...");
      recBtn.disabled = true;
      vp.stop();
    } else {
      console.log("녹음 시작 시퀀스 진입...");
      await runVoiceStage();
    }
  });
}

document.addEventListener("DOMContentLoaded", initVoicePage);

