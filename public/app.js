import { VoiceProcessor } from "./voice-processor.js";
import { 
    setQuestionText, 
    setDescriptionText, 
    setTimer, 
    setRecordButtonState, 
    setNextEnabled 
} from "./voice-ui.js";

const vp = new VoiceProcessor();

/* --- [전역 상태 관리] --- */
let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];
let isUnder14 = false;
let STAGES = [];
let stageIdx = 0;
let stageDisplayTime = 0;

const CLOUD_RUN_URL = "https://rhythme-server-357918245340.asia-northeast3.run.app/";

/* --- [데이터: 설문 문항] --- */
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
    "일반 물건보다 전자기기처럼 고관여 상품의 상세 사양(Spec) 비교에서 즐거움을 느친다.",
    "주변 사람들의 감정 변화보다 시스템의 오류나 논리적 불일치를 더 빨리 발견한다.",
    "무언가 고장 났을 때 어떤 하위 요소에서 오류가 시작됐는지 단계별로 떠올린다.",
    "복잡한 데이터나 정보에서 남들이 보지 못하는 반복 규칙이나 사이클을 찾는 것이 즐겁다.",
    "나의 신체리듬을 데이터화하고 컨디션을 최적화하는 시스템적인 방법을 구상해본다."
];

/* ============================================================
   1. 유틸리티 및 공통 로직 (모달, 단계 이동)
   ============================================================ */
window.showModal = function(msg) {
    const modal = document.getElementById('customModal');
    const msgEl = document.getElementById('modalMessage');
    if (modal && msgEl) {
        msgEl.innerText = msg;
        modal.style.display = 'flex';
    } else {
        alert(msg);
    }
};

window.closeModal = function() {
    const modal = document.getElementById('customModal');
    if (modal) modal.style.display = 'none';
};

window.nextStep = function() {
    document.getElementById(`step${currentStep}`).classList.remove('active'); 
    currentStep++;
    const nextStepElem = document.getElementById(`step${currentStep}`);
    if (nextStepElem) {
        nextStepElem.classList.add('active');
        window.scrollTo(0, 0);
    }
    // Step 4 진입 시 질문 렌더링
    if (currentStep === 4) renderQuestion();
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
            parentalCheckbox.checked = false;
        }
    }
    window.nextStep();
};

window.loadAndToggleConsent = async function(fileName, headerElement) {
    const item = headerElement.closest('.consent-item');
    const textArea = item.querySelector('.consent-text-area');

    if (item.classList.contains('active')) {
        item.classList.remove('active');
        return;
    }

    try {
        const response = await fetch(`/terms-of-use/${fileName}`);
        if (!response.ok) throw new Error();
        const text = await response.text();
        textArea.innerText = text;
    } catch (e) {
        textArea.innerText = "내용을 불러올 수 없습니다.";
    }

    document.querySelectorAll('.consent-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
};

window.checkAndGo = function() {
    const essentials = document.querySelectorAll('.essential');
    let allChecked = true;
    essentials.forEach(cb => {
        const container = cb.closest('.consent-item');
        if (container && container.style.display !== 'none') {
            if (!cb.checked) allChecked = false;
        }
    });

    if (allChecked) {
        window.nextStep();
    } else {
        window.showModal("모든 필수 항목에 동의해 주세요.");
    }
};

window.toggleDiagnosis = function(element, value) {
    element.classList.toggle('selected');
    const index = diagnoses.indexOf(value);
    if (index > -1) diagnoses.splice(index, 1);
    else diagnoses.push(value);
};

window.validateStep3 = function() {
    const ageInput = document.getElementById('age');
    const ageValue = ageInput.value.trim();
    const age = parseInt(ageValue);
    const nickname = document.getElementById('nickname').value.trim();
    const pin = document.getElementById('userPin').value;

    const existingError = document.getElementById('dynamicAgeError');
    if (existingError) existingError.remove();

    if (!ageValue || isNaN(age)) {
        window.showModal("나이를 입력해 주세요.");
        return;
    }
    if ((!isUnder14 && age < 14) || (isUnder14 && age >= 14)) {
        window.showModal("⚠️ 선택하신 참여 유형과 실제 나이가 맞지 않습니다.");
        return;
    }
    if (nickname.length < 2) { window.showModal("닉네임을 2자 이상 입력해 주세요."); return; }
    if (pin.length !== 4) { window.showModal("비밀 PIN 4자리를 정확히 입력해 주세요."); return; }

    window.nextStep(); 
};

/* ============================================================
   3. Step 4~5: SQ 설문 및 데이터 제출 (qEEG 포함)
   ============================================================ */
function renderQuestion() {
    const age = parseInt(document.getElementById('age').value);
    const questions = (age < 19) ? childQuestions : adultQuestions;
    
    if (currentQIndex >= questions.length) {
        window.nextStep(); 
        return;
    }

    const buttons = document.querySelectorAll('.ans-btn');
    buttons.forEach(btn => btn.classList.remove('selected'));

    document.getElementById('questionText').innerText = questions[currentQIndex];
    const progress = ((currentQIndex + 1) / questions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('questionCount').innerText = `${currentQIndex + 1} / ${questions.length}`;
}

window.handleAnswer = function(val) {
    const selectedBtn = event.currentTarget;
    selectedBtn.classList.add('selected');

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
    }
};

window.submitAll = async function() {
    const ecFile = document.getElementById('qeegEC')?.files[0];
    const eoFile = document.getElementById('qeegEO')?.files[0];
    const nickname = document.getElementById('nickname').value;
    const age = document.getElementById('age').value;
    const genderElem = document.querySelector('input[name="gender"]:checked');

    const payload = {
        user_id: nickname,
        age: parseInt(age),
        gender: genderElem ? genderElem.value : 'unknown',
        diagnoses: diagnoses.join(', '),
        answers: answers, // 전체 답변 배열 전송
        total_score: answers.reduce((a, b) => a + b, 0),
        qeeg_info: `EC: ${ecFile ? ecFile.name : 'none'}, EO: ${eoFile ? eoFile.name : 'none'}`
    };

    try {
        const res = await fetch(`${CLOUD_RUN_URL}submit-survey`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) window.nextStep();
        else window.showModal("제출에 실패했습니다.");
    } catch (e) { window.showModal("서버 연결 오류"); }
};

/* ============================================================
   4. Step 6~7: 음성 분석 (Voice Processing)
   ============================================================ */
function getStages(age) {
    const isMinor = age < 14;
    return [
        { id: 1, q: "Stage 1. 음성 분석 지문", d: "지문을 편안하게 읽어주세요.", text: `지금 나는 내 음성에 귀를 기울이고 있다... (지문 생략)` },
        { id: 2, q: isMinor ? "최근 파고 있는 주제?" : "문제 해결 노력 사례?", d: "편하게 말씀해 주세요." },
        { id: 3, q: isMinor ? "해결을 위해 해본 것?" : "어려웠던 지점?", d: "구체적으로 들려주세요." },
        { id: 4, q: "해결이 안 된다면 보통 어떻게 하나요?", d: "평소 습관을 말씀해 주세요." }
    ];
}

window.goToVoiceTest = function() {
    const age = parseInt(document.getElementById('age').value) || 20;
    STAGES = getStages(age);
    stageIdx = 0;
    document.getElementById('step6').style.display = 'none';
    document.getElementById('step7').style.display = 'block';
    renderStage(); 
};

function renderStage() {
    const s = STAGES[stageIdx];
    setQuestionText(s.text || s.q);
    setDescriptionText(s.d);
    setTimer(40000);
    setRecordButtonState({ recording: false });
    document.getElementById('stageBadge').innerText = `Stage ${s.id}`;
    stageDisplayTime = performance.now();
    document.getElementById('nextBtn').style.display = 'none';
}

// 녹음 버튼 단일 리스너
document.querySelector("#recordBtn").addEventListener("click", async () => {
    const btn = document.querySelector("#recordBtn");
    if (btn.dataset.recording === "1") {
        vp.stop();
        return;
    }
    await runVoiceStage();
});

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

    const payload = {
        session_id: document.getElementById('nickname').value,
        stage_id: s.id,
        status: metrics.status,
        start_latency_ms: Math.floor(clickTime - stageDisplayTime),
        pitch_mean: metrics.pitch_mean,
        snr_est_db: metrics.snr_est_db,
        // ... 필요한 지표들 추가
    };

    await fetch(`${CLOUD_RUN_URL}submit-voice-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (stageIdx < STAGES.length - 1) {
        const nBtn = document.getElementById('nextBtn');
        nBtn.style.display = 'block';
        nBtn.onclick = () => { stageIdx++; renderStage(); };
    } else {
        window.showModal("모든 테스트가 완료되었습니다.");
    }
}