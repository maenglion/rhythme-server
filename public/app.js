let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];
let isMinor = false; // 전역 변수로 관리
let isUnder14 = false; // 연령 상태 저장 변수

const CLOUD_RUN_URL = "https://rhythme-server-357918245340.asia-northeast3.run.app/";

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

// 동의 연령 확인에 따른 분기

function startResearch(under14) {
    isUnder14 = under14;
    const parentalBox = document.getElementById('parentalConsentItem');
    
    // 14세 미만일 경우에만 보호자 동의 박스 표시
    if (isUnder14) {
        parentalBox.style.display = 'block';
    } else {
        parentalBox.style.display = 'none';
    }
    
    nextStep(); // Step 2로 이동
}

// Step 2에서 '동의 완료 및 다음' 클릭 시 실행
function checkAndGo() {
    const check1 = document.getElementById('check1').checked;
    const check2 = document.getElementById('check2').checked;
    
    if (isUnder14) {
        // 14세 미만인 경우 보호자 동의 여부 추가 확인
        const checkParent = document.getElementById('checkParent').checked;
        if (check1 && check2 && checkParent) {
            nextStep();
        } else {
            alert("모든 필수 동의 항목에 체크해 주세요.");
        }
    } else {
        // 14세 이상인 경우 일반 동의 2개만 확인
        if (check1 && check2) {
            nextStep();
        } else {
            alert("모든 필수 동의 항목에 체크해 주세요.");
        }
    }
}


// 2. 진단 정보 선택 로직
function toggleDiagnosis(element, value) {
    element.classList.toggle('selected');
    const index = diagnoses.indexOf(value);
    if (index > -1) diagnoses.splice(index, 1);
    else diagnoses.push(value);
}

// 전체 동의 로직
function selectAgeGroup(minor) {
    isMinor = minor;
    const parentalBox = document.getElementById('parentalConsentItem');
    
    if (isMinor) {
        parentalBox.style.display = 'block';
    } else {
        parentalBox.style.display = 'none';
    }
    
    nextStep(); // Step 2로 이동
}

function checkAndGo() {
    const essentials = document.querySelectorAll('.essential');
    let allChecked = true;

    essentials.forEach(cb => {
        // 부모 동의 항목이 display:none이면 체크 검사에서 제외
        if (cb.closest('.consent-item').style.display !== 'none') {
            if (!cb.checked) allChecked = false;
        }
    });

    if (allChecked) {
        nextStep(); // Step 3(정보입력)으로 이동
    } else {
        alert("모든 필수 항목에 동의해 주세요.");
    }
}

// 아코디언 기능 (기존 토글 함수 보완)
function toggleConsent(id) {
    const item = typeof id === 'string' ? document.getElementById('parentalConsentItem') : document.querySelectorAll('.consent-item')[id];
    item.classList.toggle('active');
}

// 개별 체크 확인 후 다음 단계
function checkAndGo() {
    const checkboxes = document.querySelectorAll('.essential');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    if (allChecked) {
        nextStep();
    } else {
        alert("모든 필수 항목에 동의해 주세요.");
    }
}

// 전체 동의 버튼 시각적 효과 (이미 만든 함수 유지)
async function agreeAllWithEffect() {
    const checkboxes = document.querySelectorAll('.essential');
    const agreeBtn = document.getElementById('agreeAllBtn');
    
    agreeBtn.disabled = true;
    
    for (let i = 0; i < checkboxes.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        checkboxes[i].checked = true;
    }

    setTimeout(() => {
        nextStep();
    }, 300);
}

// 3. 정보입력 유효성 검사
function validateStep3() {
    const ageInput = document.getElementById('age');
    const ageValue = ageInput.value.trim();
    const age = parseInt(ageValue);
    
    // 기존에 있던 에러 메시지가 있다면 제거 (중복 방지)
    const existingError = document.getElementById('dynamicAgeError');
    if (existingError) existingError.remove();

    // 헬퍼 함수: 에러 메시지 생성 및 삽입
    const showError = (msg) => {
        const errorP = document.createElement('p');
        errorP.id = 'dynamicAgeError';
        errorP.style.color = '#ff5252';
        errorP.style.fontSize = '12px';
        errorP.style.marginTop = '8px';
        errorP.textContent = msg;
        ageInput.parentNode.appendChild(errorP); // 나이 입력창 부모 요소(input-group) 끝에 추가
        ageInput.focus();
    };

    // 1. 입력 여부 확인
    if (!ageValue || isNaN(age)) {
        showError("나이를 숫자로 입력해 주세요.");
        return;
    }

    // 2. 동의서 연령 분기(isUnder14)와 실제 나이 교차 검증
    if (!isUnder14 && age < 14) {
        showError("⚠️ 선택하신 동의서(14세 이상)와 입력하신 나이가 맞지 않습니다.");
        return;
    } 
    else if (isUnder14 && age >= 14) {
        showError("⚠️ 선택하신 동의서(14세 미만)와 입력하신 나이가 맞지 않습니다.");
        return;
    }

    // 3. 닉네임 및 PIN 유효성 검사
    const nickname = document.getElementById('nickname').value.trim();
    const pin = document.getElementById('userPin').value;
    
    if (nickname.length < 2) { alert("닉네임을 2자 이상 입력해 주세요."); return; }
    if (pin.length !== 4) { alert("비밀 PIN 4자리를 정확히 입력해 주세요."); return; }

    // 모든 검사 통과 시 다음 단계로
    nextStep(); 
}



// 파일명 표시 로직
function updateFileName(type) {
    const fileInput = document.getElementById(`qeeg${type}`);
    const statusDisplay = document.getElementById(`${type.toLowerCase()}Status`);
    
    if (fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        // 파일명이 너무 길면 잘라서 표시
        statusDisplay.innerText = fileName; 
        statusDisplay.classList.add('status-active'); // 연보라색 하이라이트
    } else {
        statusDisplay.innerText = "미첨부";
        statusDisplay.classList.remove('status-active');
    }
}

// 3. 단계 이동 로직
function nextStep() {
    const ageInput = document.getElementById('age');
    const age = ageInput ? parseInt(ageInput.value) : 0;

    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep++;
    const nextStepElem = document.getElementById(`step${currentStep}`);
    if (nextStepElem) nextStepElem.classList.add('active');

    if (currentStep === 4) renderQuestion();
}

function validateStep3() {
    const age = document.getElementById('age').value;
    if (!age) { alert("나이를 입력해주세요."); return; }
    nextStep();
}

// 4. 설문 렌더링
function renderQuestion() {
    const age = parseInt(document.getElementById('age').value);
    const questions = (age <= 18) ? childQuestions : adultQuestions;
    
    if (currentQIndex >= questions.length) {
        nextStep(); 
        return;
    }

    document.getElementById('questionText').innerText = questions[currentQIndex];
    
    // 상단 진행바 및 숫자 표시 (1/10)
    const progress = ((currentQIndex + 1) / questions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('questionCount').innerText = `${currentQIndex + 1} / ${questions.length}`;
}

function handleAnswer(val) {

    const buttons = document.querySelectorAll('.ans-btn');
    buttons.forEach(btn => btn.classList.remove('selected'));

    //현재 내가 누른 버튼에만 보라색 입히기
    const selectedBtn = event.currentTarget;
    selectedBtn.classList.add('selected');

    // 3. 선택 시각화
    setTimeout(() => {
        answers.push(val);
        currentQIndex++;
        renderQuestion();
    }, 250); 
}

// 문항을 화면에 그리는 함수
function renderQuestion() {
    const age = parseInt(document.getElementById('age').value);
    const questions = (age <= 18) ? childQuestions : adultQuestions;
    
    if (currentQIndex >= questions.length) {
        nextStep(); 
        return;
    }

    // [추가] 새 문항이 나오기 전, 모든 답변 버튼의 보라색(selected) 클래스 제거
    const buttons = document.querySelectorAll('.ans-btn');
    buttons.forEach(btn => btn.classList.remove('selected'));

    // 질문 텍스트 업데이트
    document.getElementById('questionText').innerText = questions[currentQIndex];
    
    // 진행률 업데이트 (1/10 등)
    const progress = ((currentQIndex + 1) / questions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('questionCount').innerText = `${currentQIndex + 1} / ${questions.length}`;
}



// 5. 최종 데이터 제출 (DB 컬럼 구조에 최적화)
async function submitAll() {
    // 1. EC, EO 파일 각각 가져오기 (ID 주의: qeegEC, qeegEO)
    const ecFile = document.getElementById('qeegEC').files[0];
    const eoFile = document.getElementById('qeegEO').files[0];
    // 2. 나머지 정보 가져오기 (이름, 나이 등)
    const nickname = document.getElementById('nickname').value;
    const age = document.getElementById('age').value;
    const genderElem = document.querySelector('input[name="gender"]:checked');
    const gender = genderElem ? genderElem.value : 'unknown';
    const isChild = parseInt(age) <= 18;

    // DB 컬럼명과 연구 지표 매핑 (나중에 관리자 페이지에서 이 순서대로 출력됨)
    const payload = {
        user_id: nickname,
        age: parseInt(age),
        gender: gender,
        is_child: isChild,
        diagnoses: diagnoses.join(', '),
        
        
        // 내부 매핑 정보에 따른 데이터 구성
        q1_spatial: answers[0],      // 공간 시스템
        q2_decision_alg: answers[1], // 의사결정 알고리즘
        q3_linguistic: answers[2],   // 언어 구조화 / 기계 분해
        q4_causal: answers[3],       // 인과관계 추론
        q5_reverse_eng: answers[4],  // 역설계 / 규칙 집중
        q6_decision_adv: answers[5], // 의사결정(심화) / 사실 콘텐츠
        q7_social_pattern: answers[6], // 사회적 패턴 / 분류
        q8_error_analysis: answers[7], // 결함 트리 / 수리 규칙
        q9_abstract_pattern: answers[8], // 추상 패턴 / 심층 탐구
        q10_self_opt: answers[9],    // 자기 최적화 / 실행 우위
        
        total_score: answers.reduce((a, b) => a + b, 0),
        s_tag: getSTag(answers.reduce((a, b) => a + b, 0)),
        // ★ 핵심: DB에 "EC:파일명, EO:파일명" 형태로 저장
        qeeg_info: `EC: ${ecFile ? ecFile.name : 'none'}, EO: ${eoFile ? eoFile.name : 'none'}`
    };

    try {
        const res = await fetch(`${CLOUD_RUN_URL}submit-survey`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            nextStep(); // 감사 페이지로
        } else {
            alert('데이터 전송에 실패했습니다. 관리자에게 문의하세요.');
        }
    } catch (error) {
        console.error('Submission Error:', error);
        alert('서버 연결 오류가 발생했습니다.');
    }
}

// 총점에 따른 결과 태그 생성 (논문 분류용)
function getSTag(score) {
    if (score >= 24) return "Extreme S";
    if (score >= 18) return "High S";
    if (score >= 12) return "Average S";
    return "Low S";
}
// 아코디언 내 TXT 직접 로드 로직
async function loadAndToggleConsent(fileName, headerElement) {
    const item = headerElement.closest('.consent-item');
    const textArea = item.querySelector('.consent-text-area');

    // 이미 활성화된 상태면 닫기만 함
    if (item.classList.contains('active')) {
        item.classList.remove('active');
        return;
    }

    // 텍스트 파일 fetch (확장자 체크 주의: 이미지상 child, voice는 확장자 없음)
    try {
        const response = await fetch(`/terms-of-use/${fileName}`);
        if (!response.ok) throw new Error();
        const text = await response.text();
        textArea.innerText = text;
    } catch (e) {
        textArea.innerText = "내용을 불러올 수 없습니다. 다시 시도해 주세요.";
    }

    // 다른 항목 닫고 현재 항목 열기
    document.querySelectorAll('.consent-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
}