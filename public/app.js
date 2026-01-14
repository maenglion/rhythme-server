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
let answersById = {};
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

function ensureSid() {
  let sid = localStorage.getItem("SESSION_ID");
  if (!sid) {
    sid = (crypto?.randomUUID)
      ? crypto.randomUUID()
      : `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("SESSION_ID", sid);
  }
  window.SESSION_ID = sid;
  return sid;
}

// 1. 연구용 실제 문항 배열 (참여자에게는 괄호 안의 내부 지표를 숨기고 텍스트만 노출)
// ✅ 5점 척도 라벨
const SCALE_LIKERT = [
  { v: 1, label: "전혀 아니다" },
  { v: 2, label: "아니다" },
  { v: 3, label: "보통" },
  { v: 4, label: "그렇다" },
  { v: 5, label: "매우 그렇다" },
];

const SCALE_AB = [
  { v: 1, label: "A에 매우 가깝다" },
  { v: 2, label: "A에 더 가깝다" },
  { v: 3, label: "반반" },
  { v: 4, label: "B에 더 가깝다" },
  { v: 5, label: "B에 매우 가깝다" },
];

// ✅ 문항: type = 'likert' (기존 문장형), type = 'ab' (A/B 선택형)
// id는 q1~q10은 기존 DB 컬럼 매핑을 위해 유지 추천
const childItems = [
  { id: "q1", type: "likert", text: "설명서를 끝까지 보지 않아도 다음에 무엇을 해야 할지 스스로 유추한다." },
  { id: "q2", type: "likert", text: "물건이나 환경의 배치가 왜 그렇게 되어 있는지 자주 질문하거나 설명한다." },
  { id: "q3", type: "likert", text: "장난감, 기계, 프로그램의 작동 원리가 궁금해 분해하거나 직접 만들어 보려 한다." },
  { id: "q4", type: "likert", text: "기계나 앱, 게임에서 이것저것 눌러보며 작동 원리를 빠르게 파악한다." },
  { id: "q5", type: "likert", text: "이야기나 영상에서 등장인물의 감정보다 세계관의 규칙·설정·작동 방식에 더 집중한다." },
  { id: "q6", type: "likert", text: "가상의 이야기보다 사실 기반 콘텐츠(다큐, 과학·역사)에서 원인과 구조를 찾는 것을 즐긴다." },
  { id: "q7", type: "likert", text: "동물·사물·사람 등에서 차이점과 공통점을 스스로 분류하려 한다." },
  { id: "q8", type: "likert", text: "숫자, 규칙, 퍼즐처럼 명확한 규칙이 있는 문제를 이해하고 푸는 것을 좋아한다." },
  { id: "q9", type: "likert", text: "관심 있는 주제(공룡, 우주, 기차 등)가 생기면 종류와 특징을 끝까지 파고든다." },
  { id: "q10", type: "likert", text: "문제가 생기면 감정을 나누기보다 지금 할 수 있는 행동과 다음 단계를 먼저 생각한다." },

  // ✅ 듣기 예민함(추가 2문항): DB컬럼이 아직 없으면 qeeg_info에 JSON으로 담는 방식 추천
  {
    id: "q11",
    type: "ab",
    a: "대화할 때 상대의 말속도나 말 사이 간격에 더 집중한다.",
    b: "상대방이 전달하려고 하는 바에 더 집중하는 편이다.",
    sqSide: "A",
  },
  {
    id: "q12",
    type: "ab",
    a: "문장의 내용 보다 운율, 톤, 인토네이션 등의 변화가 먼저 귀에 들어온다.",
    b: "문장의 내용과 전달하고 싶은 바에 집중하며 워딩 위주의 분석을 한다.",
    sqSide: "A",
  },
];

const adultItems = [
  { id: "q1", type: "likert", text: "처음 가보는 복잡한 환승역이나 지하철 노선도를 볼 때, 전체 구조가 머릿속에 재구성된다." },
  { id: "q2", type: "likert", text: "어떤 선택을 할 때, 감정적 평가보다 지표 간의 관계(효율, 시간 비용 등)를 먼저 본다." },
  { id: "q3", type: "likert", text: "외국어를 배울 때 문장을 외우기보다 문법 규칙이 변형되는 구조를 파악하는 것이 편하다." },
  { id: "q4", type: "likert", text: "도로 정체가 발생하면 사고 유무, 신호 주기 등 원인을 추론하려 한다." },
  { id: "q5", type: "likert", text: "새로운 기기 사용 시 설명서 없이 이것저것 눌러보며 내부 동작 논리를 파악한다." },
  { id: "q6", type: "likert", text: "일반 물건보다 전자기기처럼 고관여 상품의 상세 사양(Spec) 비교에서 즐거움을 느낀다." },
  { id: "q7", type: "ab",
    a: "편한 대화에서도 정리(1-2-3) 형태로 말하는 편이라, 지적을 받곤 한다.",
    b: "핵심만 먼저 말하고, 나머지는 상황/질문에 따라 채우는 편이다.",
    sqSide: "A",
  },
  { id: "q8", type: "ab",
    a: "계획이 깨지면 불편/초조가 크게 올라가고, 다시 계획을 세워야 마음이 가라앉는다.",
    b: "계획이 깨지는 건 흔한 일이라, 당황하지 않고 조정하면 된다고 느낀다.",
    sqSide: "A",
  },
  { id: "q9", type: "ab",
    a: "정답 없는 문제는 가설/판단 기준을 먼저 세우고, 그 기준을 검증하는 방식으로 찾는다.",
    b: "정답 없는 문제는 자료를 넓게 모은 뒤에 방향을 잡는다.",
    sqSide: "A",
  },
  { id: "q10", type: "ab",
    a: "다수가 따르는 비논리는 관습/운영 효율이 있어 남아있는 경우가 많아, 크게 문제 삼지 않는 편이다.",
    b: "다수가 따르더라도 비논리가 계속 보이면, 불편을 감수하고라도 고치려 했던 경험이 꾸준히 있다.",
    sqSide: "B", // ✅ 여기만 B가 SQ 방향
  },

  { id: "q11", type: "ab",
    a: "대화할 때 상대의 말속도나 말 사이 간격에 더 집중한다.",
    b: "상대방이 전달하려고 하는 바에 더 집중하는 편이다.",
    sqSide: "A",
  },
  { id: "q12", type: "ab",
    a: "문장의 내용 보다 운율, 톤, 인토네이션 등의 변화가 먼저 귀에 들어온다.",
    b: "문장의 내용과 전달하고 싶은 바에 집중하며 워딩 위주의 분석을 한다.",
    sqSide: "A",
  },
];


/* ============================================================
   1. 공통 및 단계 이동 제어 (window 등록 필수)
   ============================================================ */
window.showStep = function(stepNum) {
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`step${stepNum}`);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
    currentStep = stepNum;
  }
};

window.goToNextStep = function() {
  window.showStep(currentStep + 1);
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
window.checkAndGo = function () {
  // 1) 필수 동의 체크(기존 로직 유지)
  const essentials = document.querySelectorAll(".essential");
  let allChecked = true;
  essentials.forEach(cb => {
    if (cb.offsetParent !== null && !cb.checked) allChecked = false;
  });

  if (!allChecked) {
    if (typeof window.showModal === "function") window.showModal("필수 항목에 모두 동의해 주세요.");
    else alert("필수 항목에 모두 동의해 주세요.");
    return;
  }

  // 2) 선택 동의 저장만(선택)
  const qeegAgreed = document.getElementById("checkQeeg")?.checked || false;
  localStorage.setItem("QEEG_AGREED", String(qeegAgreed));

  // 3) ✅ 여기서 sid 만들지 말고, ✅ 여기서 voice_info로 가지 말고
  //    ✅ Step3로만 이동
  if (typeof window.showStep === "function") {
    window.showStep(3);
  } else {
    document.querySelectorAll(".step").forEach(el => (el.style.display = "none"));
    const el = document.getElementById("step3");
    if (el) el.style.display = "block";
  }
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
    window.showStep(3); 
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
  const ageVal = document.getElementById('age')?.value;
  const nickVal = document.getElementById('nickname')?.value?.trim();
  const pinVal = document.getElementById('userPin')?.value || "";
  const age = parseInt(ageVal, 10);

  if (!nickVal || nickVal.length < 2) { window.showModal("닉네임을 2자 이상 입력해주세요."); return; }
  if (pinVal.length !== 4) { window.showModal("PIN 4자리를 입력해주세요."); return; }
  if (!ageVal || Number.isNaN(age)) { window.showModal("나이를 입력해주세요."); return; }
  if ((!isUnder14 && age < 14) || (isUnder14 && age >= 14)) {
    window.showModal("⚠️ 선택하신 참여 유형과 실제 나이가 일치하지 않습니다.");
    return;
  }

  // ✅ 검증 통과 → SQ 시작(= Step4로 이동 + 1번 질문 렌더)
  window.startSQTest();
};
/* ============================================================
   3. Step 4~5: 설문 및 qEEG 업로드
   ============================================================ */

// ✅ 설문 상태(전역)

// ✅ 현재 설문 문항 세트 선택
let __sqItemsCache = null;
let __sqCurrent = null;

function getSQQuestions() {
  // 너희 기존 로컬스토리지 키 사용
  const age = parseInt(localStorage.getItem("rhythmi_age") || "0", 10);
  const isChild = age > 0 && age < 14;

  __sqItemsCache = isChild ? childItems : adultItems;
  return __sqItemsCache;
}
window.startSQTest = function () {
  currentQIndex = 0;
  const questions = getSQQuestions();
  answers = new Array(questions.length).fill(null);
  answersById = {};


  if (typeof window.showStep === "function") window.showStep(4);
  else {
    document.querySelectorAll(".step").forEach(el => (el.style.display = "none"));
    const s4 = document.getElementById("step4");
    if (s4) s4.style.display = "block";
  }

  renderQuestion(); // ✅ 여기(함수 안)에서만 호출
};


// ✅ 질문 렌더
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


// ✅ 질문 렌더 (기존 함수 교체)
function renderQuestion() {
  const questions = getSQQuestions();
  const q = questions[currentQIndex];

  if (!q) {
    completeSQTest();     // ✅ 완료 처리 먼저
    window.showStep?.(5); // ✅ 설문 완료 → step5
    return;
  }

  __sqCurrent = q;

  // 선택 초기화
  document.querySelectorAll(".ans-btn").forEach((btn) => btn.classList.remove("selected"));

  // 질문 텍스트
  const qText = document.getElementById("questionText");
  if (qText) {
    if (q.type === "ab") {
      qText.innerHTML = `
        <div class="q-title">둘 중 어떤 쪽에 더 가까운가요?</div>
        <div class="q-ab"><b>A.</b> ${escapeHtml(q.a)}</div>
        <div class="q-ab"><b>B.</b> ${escapeHtml(q.b)}</div>
      `;
    } else {
      qText.textContent = q.text || "";
    }
  }

  if (q.type === "ab") {
  qText.innerHTML = `
    <div class="q-title">둘 중 어떤 쪽에 더 가까운가요?</div>

    <div class="ab-wrap">
      <div class="ab-box">
        <div class="ab-head"><span class="ab-badge">A</span></div>
        <div class="ab-body">${escapeHtml(q.a)}</div>
      </div>

      <div class="ab-box">
        <div class="ab-head"><span class="ab-badge">B</span></div>
        <div class="ab-body">${escapeHtml(q.b)}</div>
      </div>
    </div>
  `;
} else {
  qText.textContent = q.text || "";
}

  // 버튼 라벨/클릭 바인딩 (ans-btn 5개를 척도에 맞게 바꿈)
  const scale = (q.type === "ab") ? SCALE_AB : SCALE_LIKERT;
  const btns = Array.from(document.querySelectorAll(".ans-btn"));

  // 5개만 쓰는 전제 (더 많으면 앞 5개만)
  for (let i = 0; i < btns.length; i++) {
    const btn = btns[i];
    const s = scale[i];

    if (!s) {
      btn.style.display = "none";
      continue;
    }
    btn.style.display = "";
    btn.innerText = s.label;
    btn.dataset.value = String(s.v);

    // HTML에 onclick이 있어도 여기서 덮어씌워서 일관성 확보
    btn.onclick = (evt) => window.handleAnswer(s.v, evt);
  }

  // 진행 표시
  const count = document.getElementById("questionCount");
  if (count) count.innerText = `${currentQIndex + 1} / ${questions.length}`;

  const progress = ((currentQIndex + 1) / questions.length) * 100;
  const bar = document.getElementById("progressBar");
  if (bar) bar.style.width = `${progress}%`;
}


// ✅ 답 클릭
// ✅ 답 클릭 (기존 함수 교체)
window.handleAnswer = function (val, evt) {
  const el = evt?.currentTarget;
  if (!el || !__sqCurrent) return;

  document.querySelectorAll(".ans-btn").forEach((btn) => btn.classList.remove("selected"));
  el.classList.add("selected");

  setTimeout(() => {
    // index 기반(기존 호환)
    answers[currentQIndex] = Number(val);

    // id 기반(신규)
    answersById[__sqCurrent.id] = Number(val);

    currentQIndex++;
    renderQuestion();
  }, 150);
};


function renderSurvey(items, containerId = "survey") {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  wrap.innerHTML = items.map((q, idx) => {
    const scale = (q.type === "ab") ? SCALE_AB : SCALE_LIKERT;
    const head = (q.type === "ab")
      ? `
        <div class="q-title">둘 중 어떤 쪽에 더 가까운가요?</div>
        <div class="q-ab"><b>A.</b> ${q.a}</div>
        <div class="q-ab"><b>B.</b> ${q.b}</div>
      `
      : `<div class="q-text">${q.text}</div>`;

    const opts = scale.map(s => `
      <label class="opt">
        <input type="radio" name="${q.id}" value="${s.v}">
        <span>${s.label}</span>
      </label>
    `).join("");

    return `
      <div class="card question-card">
        <div class="q-no">Q${idx + 1}</div>
        ${head}
        <div class="opts">${opts}</div>
      </div>
    `;
  }).join("");
}



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

// ===============================
// SQ v2_14 (likert + AB-5) helpers
// ===============================

// ✅ 기존 DB 컬럼 매핑은 q1~q10까지만 유지
const LEGACY_KEYS = [
  "q1_spatial", "q2_decision_alg", "q3_linguistic", "q4_causal", "q5_reverse_eng",
  "q6_decision_adv", "q7_social_pattern", "q8_error_analysis", "q9_abstract_pattern", "q10_self_opt",
];

// ✅ 문항 1개를 SQ 방향(0~4)으로 점수화
function scoreItemTo0_4(q, v1to5) {
  if (typeof v1to5 !== "number") return null;

  // AB 5점: 1(A매우)~5(B매우)
  if (q.type === "ab") {
    const side = q.sqSide || "A"; // A가 SQ면 A쪽일수록 점수↑
    return (side === "A") ? (5 - v1to5) : (v1to5 - 1); // 0~4
  }

  // Likert 5점: 1~5 -> 0~4
  return (v1to5 - 1);
}

function computeSqScore100(items, answersById) {
  let sum = 0, max = 0;

  for (const q of items) {
    const v = answersById?.[q.id];
    const s = scoreItemTo0_4(q, v);
    if (s === null) continue;
    sum += s;
    max += 4;
  }

  return max ? Math.round(100 * (sum / max)) : 0;
}

function buildLegacyMapFromAnswers(answersById) {
  // q1~q10만 기존 컬럼에 맞춰 넣기
  return Object.fromEntries(
    LEGACY_KEYS.map((k, i) => [k, answersById?.[`q${i + 1}`] ?? null])
  );
}

function buildSurveyPayloadV2({
  sid,
  nickname,
  age,
  gender,
  isChild,
  diagnoses,
  items,
  answersById,
  ecFile,
  eoFile,
}) {
  const legacyMap = buildLegacyMapFromAnswers(answersById);
  const score100 = computeSqScore100(items, answersById);

  return {
    session_id: sid,
    user_id: sid, // ✅ 분석 연결 위해 sid로 통일
    age,
    gender,
    is_child: isChild,
    diagnoses: (diagnoses || []).join(", "),

    ...legacyMap,

    total_score: score100,
    s_tag: "SQ(v2-14)",

    // ✅ 전체 원본응답 + 파일명 + 버전은 qeeg_info로
    qeeg_info: JSON.stringify({
      survey_version: "v2_14",
      nickname: nickname || null,
      answers: answersById,
      files: {
        EC: ecFile ? ecFile.name : null,
        EO: eoFile ? eoFile.name : null,
      },
      createdAt: Date.now(),
    }),
  };
}

/* ============================================================
   최종 데이터 제출 (설문 + qEEG 업로드)
   ============================================================ */
window.submitAll = async function (evt) {
  // ✅ sid 생성 금지: 읽기만
  const sid =
    localStorage.getItem("SESSION_ID") ||
    new URLSearchParams(location.search).get("sid");

  if (!sid) {
    alert("세션이 없습니다. 처음부터 다시 진행해주세요.");
    location.href = "./index.html";
    return;
  }
  console.log("[SID] used at submitAll:", sid);

  const ecFile = document.getElementById("qeegEC")?.files?.[0] || null;
  const eoFile = document.getElementById("qeegEO")?.files?.[0] || null;

  const nickname = (document.getElementById("nickname")?.value || "").trim();
  const age = parseInt(document.getElementById("age")?.value || "0", 10);
  const gender = document.querySelector('input[name="gender"]:checked')?.value || "unknown";
  const isChild = age > 0 && age <= 18;

  const currentBtn = evt?.currentTarget;
  if (currentBtn) {
    currentBtn.disabled = true;
    currentBtn.innerText = "데이터 분석중...";
  }

 
const showQeegInfoToast = () => {
  const msg =
    "🔎 데이터 분석중...\n\n" +
    "• 설문(SQ) + 음성(리듬/속도/휴지/억양) 지표를 먼저 분석합니다.\n" +
    "• qEEG를 올린 경우, 대역파워/좌우비대칭/눈뜸·눈감음 차이 같은 패턴을 추가로 추출해\n" +
    "  음성 지표와의 ‘관계(힌트)’를 연구적으로 탐색합니다.\n" +
    "• 음성 내용(텍스트)은 저장하지 않고, 수치 지표만 저장됩니다.";

  if (typeof window.showModal === "function") window.showModal(msg);
  else alert(msg);

  setTimeout(() => {
    if (typeof window.closeModal === "function") window.closeModal();
  }, 5000);
};

try {
  // ✅ qEEG 올린 경우에만 안내 모달
  if (ecFile && eoFile) showQeegInfoToast();

  // 1) qEEG 파일 없을 때 confirm
  if (!ecFile || !eoFile) {
    const confirmGo = await window.showConfirmModal?.(
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

    // 2) 설문 완료 체크 (answersById 기준)
    const items = getSQQuestions(); // adultItems / childItems
    const expectedLen = items.length;
    const answeredCount = items.filter(q => answersById?.[q.id] !== undefined && answersById?.[q.id] !== null).length;

    if (answeredCount !== expectedLen) {
      window.showModal?.("설문이 완료되지 않았습니다.");
      if (currentBtn) {
        currentBtn.disabled = false;
        currentBtn.innerText = "음성분석 시작";
      }
      return;
    }

    // 3) payload 생성
    const surveyPayload = buildSurveyPayloadV2({
      sid,
      nickname,
      age,
      gender,
      isChild,
      diagnoses: window.diagnoses || [],
      items,
      answersById,
      ecFile,
      eoFile,
    });

    // 4) 설문 저장
    const surveyRes = await fetch(API("/submit-survey"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(surveyPayload),
    });

    if (!surveyRes.ok) {
      const t = await surveyRes.text().catch(() => "");
      throw new Error(`submit-survey failed ${surveyRes.status}: ${t}`);
    }

    // 5) qEEG 업로드 (있으면)
    const ecResult = ecFile ? await uploadSingleFile(sid, "EC", ecFile) : null;
    const eoResult = eoFile ? await uploadSingleFile(sid, "EO", eoFile) : null;

    // 6) 로컬 저장(기존 흐름 유지)
    localStorage.setItem("rhythmi_session_id", sid);
    localStorage.setItem("rhythmi_user_id", nickname || sid);
    localStorage.setItem("rhythmi_age", String(age));
    localStorage.setItem("rhythmi_gender", gender);

    // 7) 안내 + 다음 이동
    window.showModal?.(
      `✅ 저장 완료\n\nEC: ${ecFile?.name || "none"}\nEO: ${eoFile?.name || "none"}`
    );

    const goNext = () => {
      window.closeModal?.();
      location.href = `voice_info.html?sid=${encodeURIComponent(sid)}`;
    };

    const okBtn = document.getElementById("modalOkBtn");
    if (okBtn) okBtn.onclick = goNext;
    else goNext();

    console.log("EC path:", ecResult?.path);
    console.log("EO path:", eoResult?.path);

  } catch (error) {
    console.error("Submit Error:", error);
    alert("서버 오류: " + (error?.message || String(error)));
    if (currentBtn) {
      currentBtn.disabled = false;
      currentBtn.innerText = "음성분석 시작";
    }
  }
};


// ✅ 설문 완료 로컬 저장(필요하면 유지)
function completeSQTest() {
  const items = getSQQuestions();
  const score100 = computeSqScore100(items, answersById);

  localStorage.setItem("rhythmi_sq_done", "1");
  localStorage.setItem("rhythmi_sq_answers", JSON.stringify(answers)); // index 기반 호환
  localStorage.setItem("rhythmi_sq_answers_by_id", JSON.stringify(answersById)); // id 기반
  localStorage.setItem("rhythmi_sq_version", "v2_14");
  localStorage.setItem("rhythmi_sq_score_100", String(score100));

  localStorage.setItem(
    "rhythmi_confidence_note",
    "신뢰도(Confidence)는 설문(자기보고) 점수와 음성 기반 지표(말의 리듬/속도/휴지/억양 변동)에서 추정된 성향이 얼마나 일치하는지로 계산됩니다. 두 값의 차이가 클수록, 의도적 응답/상황 요인(피로·주변 소음·감정 상태 등) 가능성이 있어 신뢰도가 낮아질 수 있습니다."
  );
}


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
  window.goToNextStep();         // ✅ step6 -> step7 (active 전환)
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
// 임시 서버 테스트용 
  const age = parseInt(document.getElementById('age')?.value || '0', 10);
const age_group = age < 14 ? "under14" : (age < 19 ? "child" : "adult");

const num0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const int0 = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const payload = {
  session_id: localStorage.getItem("SESSION_ID") || window.SESSION_ID, // ✅ 기준 통일
  stage_id: Number(s.id), // ✅ 숫자 확정
  age_group,
  status: String(metrics?.status || "completed"),

  start_latency_ms: int0(clickTime - stageDisplayTime),
  recorded_ms: int0(metrics?.recorded_ms ?? 40000),
  stop_offset_ms: int0(metrics?.recorded_ms ?? 40000),

  pitch_mean: num0(metrics?.pitch_mean),
  pitch_sd: num0(metrics?.pitch_sd),
  speech_rate: num0(metrics?.speech_rate),
  pause_ratio: num0(metrics?.pause_ratio),

  jitter: 0,
  shimmer: 0,

  // ✅ null 보내지 말고 0으로 (NOT NULL 대비)
  noise_floor_db: num0(cal?.noise_floor_db ?? metrics?.noise_floor_db),
  snr_est_db: num0(metrics?.snr_est_db),
  clipping_ratio: num0(metrics?.clipping_ratio),
  bg_voice_ratio: num0(metrics?.bg_voice_ratio),

  // ✅ 시간도 null 금지
  time_reading_style: 0,
  time_digits_rule: 0,
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
   [핵심] 초기화 및 버튼 이벤트 연결
   ============================================================ */

function initVoicePage() {
  const recBtn = document.getElementById("recordBtn");
  if (!recBtn) return; 

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

document.addEventListener("DOMContentLoaded", () => {
  initVoicePage();

  const finishBtn = document.getElementById("finishBtn");
  if (finishBtn) {
    // 혹시 inline onclick 있었으면 제거
    finishBtn.onclick = null;
    finishBtn.style.display = "none";
    finishBtn.disabled = true;
  }

  const nextBtn = document.getElementById("nextStepBtn");
  if (nextBtn) {
    nextBtn.onclick = null; // ✅ inline onclick 무력화
    nextBtn.addEventListener("click", () => {
      const sid = localStorage.getItem("SESSION_ID");
      if (!sid) {
        alert("세션이 없습니다. Step5 제출을 먼저 완료해주세요.");
        location.href = "./index.html";
        return;
      }
      location.href = `voice_info.html?sid=${encodeURIComponent(sid)}`;
    });
  }
});
