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



/* --- [전역 상태 관리] --- */
let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];
let isUnder14 = false;
let STAGES = [];
let stageIdx = 0;
let stageDisplayTime = 0;


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

window.loadAndToggleConsent = function(fileName, headerElement) {
    const item = headerElement.closest('.consent-item');
    const textArea = item.querySelector('.consent-text-area');
    if (item.classList.contains('active')) {
        item.classList.remove('active');
        return;
    }
    document.querySelectorAll('.consent-item').forEach(el => el.classList.remove('active'));
    textArea.innerText = CONSENT_TEXTS[fileName] || "내용을 준비 중입니다.";
    item.classList.add('active');
};

window.checkAndGo = function() {
    const essentials = document.querySelectorAll('.essential');
    let allChecked = true;
    essentials.forEach(cb => {
        const container = cb.closest('.consent-item');
        if (container && container.style.display !== 'none' && !cb.checked) allChecked = false;
    });
    if (allChecked) window.nextStep();
    else window.showModal("모든 필수 항목에 동의해 주세요.");
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
    currentBtn.innerText = "데이터 전송 중...";
  }

  if (!ecFile || !eoFile) {
    const confirmGo = confirm("⚠️ qEEG 파일이 선택되지 않았습니다.\n\n파일 없이 진행할까요?");
    if (!confirmGo) {
      if (currentBtn) {
        currentBtn.disabled = false;
        currentBtn.innerText = "음성분석 시작";
      }
      return;
    }
  }

  if (answers.length !== 10) {
    alert("설문이 완료되지 않았습니다.");
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

    if (ecFile) await uploadSingleFile(nickname, 'EC', ecFile);
    if (eoFile) await uploadSingleFile(nickname, 'EO', eoFile);

alert("✅ 저장 완료");

const uploadBtn = document.getElementById('uploadBtn');
if (uploadBtn) uploadBtn.style.display = 'none';

const nextBtn = document.getElementById('nextStepBtn');
if (nextBtn) nextBtn.style.display = 'block';


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
window.goToVoiceTest = function() {
    const ageInput = document.getElementById('age');
    const age = ageInput ? parseInt(ageInput.value) : 20;
    
    STAGES = getStages(age);
    stageIdx = 0;

    // display: none 대신 정의된 nextStep()을 사용하여 .active 클래스 교체
    // 현재 currentStep이 6(안내)인 상태이므로 호출 시 7(녹음)로 자연스럽게 이동
    window.nextStep(); 
    renderStage();

};

function getStages(age) {
    const isMinor = age < 14;
    return [
        { id: 1, q: "Stage 1", d: "지문을 읽어주세요.", text: "지금 나는 내 음성에 귀를 기울이고 있다..." },
        { id: 2, q: isMinor ? "최근 주제?" : "해결 사례?", d: "말씀해 주세요." }
    ];
}


/* ============================================================
   [신규 추가] Step 7: 음성 테스트 화면 전용 렌더링 함수
   ============================================================ */
function renderStage() {
    const s = STAGES[stageIdx];
    if (!s) return;

    // 2. HTML 요소에 데이터 주입
    // HTML의 id가 'questionText'와 'descriptionText'로 되어 있어야 함

    const qEl = document.getElementById('question') || document.getElementById('questionText');
    const dEl = document.getElementById('desc') || document.getElementById('descriptionText');
    const badge = document.getElementById('stageBadge'); // Stage 번호

    if (qEl) qEl.innerText = s.text || s.q;
    if (dEl) dEl.innerText = s.d;
    if (badge) badge.innerText = `Stage ${s.id}`;

     stageDisplayTime = performance.now(); // ✅ 여기서 찍는다

    // 3. 음성 UI 초기화 (보라색 타이머 등)
    if (typeof setTimer === 'function') setTimer(40000);
    if (typeof setRecordButtonState === 'function') setRecordButtonState({ recording: false });

    // 4. 녹음 전에는 '다음 단계로' 버튼 숨기기
    const nBtn = document.getElementById('nextBtn');
    if (nBtn) nBtn.style.display = 'none';
}


async function runVoiceStage() {
  const s = STAGES[stageIdx];
  const clickTime = performance.now();

  setRecordButtonState({ recording: false, calibrating: true });
  const cal = await vp.calibrateSilence(2);

  setRecordButtonState({ recording: true, calibrating: false });
  const metrics = await vp.startStage({
    durationSec: 40,
    onTick: ({ leftMs }) => setTimer(leftMs, 40),
  });

  setRecordButtonState({ recording: false });

  const age = parseInt(document.getElementById('age')?.value || '0', 10);
  const age_group = age < 14 ? "under14" : (age < 19 ? "child" : "adult");

  const payload = {
    session_id: document.getElementById('nickname')?.value || "unknown",
    stage_id: s.id,
    age_group,
    status: metrics?.status || "completed",
    start_latency_ms: Math.max(0, Math.floor(clickTime - stageDisplayTime)),

    recorded_ms: metrics?.recorded_ms ?? 40000,
    stop_offset_ms: metrics?.stop_offset_ms ?? 40000,

    pitch_mean: metrics?.pitch_mean ?? 0,
    pitch_sd: metrics?.pitch_sd ?? 0,
    speech_rate: metrics?.speech_rate ?? 0,
    pause_ratio: metrics?.pause_ratio ?? 0,
    jitter: metrics?.jitter ?? 0,
    shimmer: metrics?.shimmer ?? 0,

    noise_floor_db: cal?.noise_floor_db ?? null,
    snr_est_db: cal?.snr_est_db ?? null,
    clipping_ratio: metrics?.clipping_ratio ?? null,
    bg_voice_ratio: metrics?.bg_voice_ratio ?? null,

    time_reading_style: metrics?.time_reading_style ?? null,
    time_digits_rule: metrics?.time_digits_rule ?? null,
  };

  console.log("Saving voice data:", payload);

  const res = await fetch(API('/submit-voice-stage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`submit-voice-stage failed ${res.status}: ${t}`);
  }
}


/* ============================================================
   [핵심] 녹음 버튼 이벤트 연결 (이게 있어야 runVoiceStage가 작동함)
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    const recBtn = document.querySelector("#recordBtn");
    
    if (recBtn) {
        recBtn.addEventListener("click", async () => {
            // 버튼의 데이터 상태(recording)를 확인하여 분기
            // voice-ui.js에서 녹음 시작 시 이 값을 "1"로 바꿉니다.
            if (recBtn.dataset.recording === "1") {
                console.log("녹음 중단 요청...");
                vp.stop(); // voice-processor.js 엔진 정지
            } else {
                console.log("녹음 시작 시퀀스 진입...");
                await runVoiceStage(); // 정의해둔 음성 분석 로직 실행
            }
        });
    } else {
        console.error("오류: #recordBtn 요소를 찾을 수 없습니다. HTML ID를 확인하세요.");
    }
});