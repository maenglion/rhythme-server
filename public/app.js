let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];

const CLOUD_RUN_URL = "https://rhythme-server-357918245340.asia-northeast3.run.app/";

// 1. 연구용 실제 문항 배열 (참여자에게는 괄호 안의 내부 지표를 숨기고 텍스트만 노출)
const childQuestions = [
    "1. 설명서를 끝까지 보지 않아도 다음에 무엇을 해야 할지 스스로 유추한다.",
    "2. 물건이나 환경의 배치가 왜 그렇게 되어 있는지 자주 질문하거나 설명한다.",
    "3. 장난감, 기계, 프로그램의 작동 원리가 궁금해 분해하거나 직접 만들어 보려 한다.",
    "4. 기계나 앱, 게임에서 이것저것 눌러보며 작동 원리를 빠르게 파악한다.",
    "5. 이야기나 영상에서 등장인물의 감정보다 세계관의 규칙·설정·작동 방식에 더 집중한다.",
    "6. 가상의 이야기보다 사실 기반 콘텐츠(다큐, 과학·역사)에서 원인과 구조를 찾는 것을 즐긴다.",
    "7. 동물·사물·사람 등에서 차이점과 공통점을 스스로 분류하려 한다.",
    "8. 숫자, 규칙, 퍼즐처럼 명확한 규칙이 있는 문제를 이해하고 푸는 것을 좋아한다.",
    "9. 관심 있는 주제(공룡, 우주, 기차 등)가 생기면 종류와 특징을 끝까지 파고든다.",
    "10. 문제가 생기면 감정을 나누기보다 지금 할 수 있는 행동과 다음 단계를 먼저 생각한다."
];

const adultQuestions = [
    "1. 처음 가보는 복잡한 환승역이나 지하철 노선도를 볼 때, 전체 구조가 머릿속에 재구성된다.",
    "2. 어떤 선택을 할 때, 감정적 평가보다 지표 간의 관계(효율, 시간 비용 등)를 먼저 본다.",
    "3. 외국어를 배울 때 문장을 외우기보다 문법 규칙이 변형되는 구조를 파악하는 것이 편하다.",
    "4. 도로 정체가 발생하면 사고 유무, 신호 주기 등 원인을 추론하려 한다.",
    "5. 새로운 기기 사용 시 설명서 없이 이것저것 눌러보며 내부 동작 논리를 파악한다.",
    "6. 일반 물건보다 전자기기처럼 고관여 상품의 상세 사양(Spec) 비교에서 즐거움을 느낀다.",
    "7. 주변 사람들의 감정 변화보다 시스템의 오류나 논리적 불일치를 더 빨리 발견한다.",
    "8. 무언가 고장 났을 때 어떤 하위 요소에서 오류가 시작됐는지 단계별로 떠올린다.",
    "9. 복잡한 데이터나 정보에서 남들이 보지 못하는 반복 규칙이나 사이클을 찾는 것이 즐겁다.",
    "10. 나의 신체리듬을 데이터화하고 컨디션을 최적화하는 시스템적인 방법을 구상해본다."
];

// 2. 진단 정보 선택 로직
function toggleDiagnosis(element, value) {
    element.classList.toggle('selected');
    const index = diagnoses.indexOf(value);
    if (index > -1) diagnoses.splice(index, 1);
    else diagnoses.push(value);
}

// 전체 동의 로직
function agreeAll() {
    const checkboxes = document.querySelectorAll('.essential');
    checkboxes.forEach(cb => cb.checked = true);
    nextStep();
}

// 파일명 표시 로직
function updateFileName(type) {
    const input = document.getElementById(`qeeg${type.toUpperCase()}`);
    const status = document.getElementById(`${type}Status`);
    if (input.files.length > 0) {
        status.innerText = "첨부됨";
        status.style.color = "#FFFFFF";
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

// 4. 설문 렌더링 (진행률 표시: n / 10)
function renderQuestion() {
    const age = parseInt(document.getElementById('age').value);
    const questions = (age <= 18) ? childQuestions : adultQuestions;
    
    if (currentQIndex >= questions.length) {
        nextStep(); // 설문 종료 시 qEEG 제출 단계로
        return;
    }

    // 질문 텍스트 업데이트
    document.getElementById('questionText').innerText = questions[currentQIndex];
    
    // 상단 진행바 및 숫자 표시 (1/10)
    const progress = ((currentQIndex + 1) / questions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('questionCount').innerText = `${currentQIndex + 1} / ${questions.length}`;
}

function handleAnswer(val) {
    answers.push(val);
    currentQIndex++;
    renderQuestion();
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