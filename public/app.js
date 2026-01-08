let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];

const CLOUD_RUN_URL = "https://rhythme-server-357918245340.asia-northeast3.run.app/"
// 어린이·청소년용 (만 18세 이하) - PDF 기반 연구용 10문항
const childQuestions = [
    "1. 설명서 없이도 다음에 무엇을 할지 스스로 유추하나요? (공간·구조)",
    "2. 물건/환경의 배치가 왜 그렇게 되어 있는지 자주 질문하나요? (패턴·구조)",
    "3. 작동 원리가 궁금해 장난감/기계를 분해하거나 만드나요? (물리적 인과)",
    "4. 기계나 앱을 이것저것 눌러보며 작동 원리를 빠르게 파악하나요? (알고리즘)",
    "5. 이야기의 감정보다 세계관의 규칙·설정에 더 집중하나요? (정보 수집)",
    "6. 사실 기반 콘텐츠(다큐, 과학)에서 원인을 찾는 걸 즐기나요? (인과 검증)",
    "7. 일상 사물을 크기, 색상, 종류별로 분류하거나 나열하나요? (분류 성향)",
    "8. 동식물의 특징을 세밀하게 관찰하고 차이점을 분류하나요? (생물학적 분류)",
    "9. 문제를 해결할 때 기존 방식이 아닌 자신만의 체계를 만드나요? (패러다임)",
    "10. 망가진 물건을 고치거나 원인을 찾아내려 노력하나요? (역설계)"
];

// 성인용 (만 19세 이상) - 표준 SQ-Short 기반 10문항
const adultQuestions = [
    "1. 새로운 가전제품을 살 때 작동 원리를 꼼꼼히 파악하는 편인가요?",
    "2. 기차 노선도나 지도를 볼 때 전체적인 구조가 쉽게 이해되나요?",
    "3. 어떤 사건이 일어났을 때 감정보다 원인과 결과에 더 관심이 가나요?",
    "4. 도서관의 책이나 컴퓨터 파일들을 나름의 규칙으로 정리하는 걸 좋아하나요?",
    "5. 수학 공식이나 물리 법칙이 실생활에 적용되는 것을 보면 흥미롭나요?",
    "6. 전자기기의 세부 사양(Spec)을 비교하고 분석하는 것을 즐기나요?",
    "7. 일상적인 대화보다 특정 주제에 대한 데이터나 사실 위주의 대화를 선호하나요?",
    "8. 가구 조립이나 기계 수리를 직접 하는 것에 자신이 있나요?",
    "9. 역사의 흐름을 볼 때 연도나 사건의 계보를 외우는 것이 쉬운 편인가요?",
    "10. 사물의 작동 방식이 궁금해서 내부 구조를 상상해 보곤 하나요?"
];


// 진단 정보 다중 선택 로직
function toggleDiagnosis(element, value) {
    element.classList.toggle('selected');
    const index = diagnoses.indexOf(value);
    if (index > -1) diagnoses.splice(index, 1);
    else diagnoses.push(value);
}

// 다음 단계 이동 및 로직 처리
function nextStep() {
    const age = parseInt(document.getElementById('age').value);
    
    // Step 3(정보입력) -> Step 4(SQ테스트) 진입 시 안내문구 처리
    if (currentStep === 3) {
        const guide = document.getElementById('ageGuide');
        guide.innerText = age < 12 ? "※ 12세 미만은 보호자와 함께 진행해 주세요." : "문항을 읽고 응답해 주세요.";
    }

    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep++;
    document.getElementById(`step${currentStep}`).classList.add('active');
    
    if (currentStep === 4) renderQuestion();
}

function validateStep3() {
    const age = document.getElementById('age').value;
    const guide = document.getElementById('surveyGuide');
    
    // 12세 미만은 부모 동반 안내 필수
    guide.innerText = (parseInt(age) < 12) ? "💡 보호자와 함께 문항을 읽고 응답해 주세요." : "";
    nextStep();
}

function saveAnswer(val) {
    surveyData.answers.push(val);
    const questions = (parseInt(document.getElementById('age').value) <= 18) ? childQuestions : adultQuestions;
    
    if (surveyData.answers.length < questions.length) {
        renderQuestion();
    } else {
        nextStep(); // SQ 완료 후 Step 5(qEEG)로
    }
}

// 1페이지 1문항 렌더링
function renderQuestion() {
    const age = parseInt(document.getElementById('age').value);
    const questions = (age <= 18) ? childQuestions : adultQuestions; // childQuestions는 PDF 기반 데이터
    
    if (currentQIndex >= questions.length) {
        nextStep(); // 모든 문항 종료 시 Step 5(qEEG/감사)로 이동
        return;
    }

    document.getElementById('questionText').innerText = questions[currentQIndex];
    const progress = ((currentQIndex + 1) / questions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
}

function handleAnswer(val) {
    answers.push(val);
    currentQIndex++;
    renderQuestion();
}

/// 최종 제출 (qEEG 데이터 정보 포함)
async function submitAll() {
    const qeegInput = document.getElementById('qEegFile');
    const nickname = document.getElementById('nickname').value;
    const age = document.getElementById('age').value;
    
    // 성별 선택 확인 (radio 버튼일 경우 예외처리 방지)
    const genderElem = document.querySelector('input[name="gender"]:checked');
    const gender = genderElem ? genderElem.value : 'unknown';

    const payload = {
        user_id: nickname,
        age: parseInt(age),
        gender: gender,
        diagnoses: diagnoses,
        answers: answers,
        qeeg_info: qeegInput.files[0] ? qeegInput.files[0].name : null 
    };

    try {
        const res = await fetch(`${CLOUD_RUN_URL}submit-survey`, { // URL 뒤에 /가 이미 있으므로 확인
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            // 성공 시 Step 6(감사 페이지)으로 이동
            nextStep(); 
        } else {
            alert('전송 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('서버와 연결할 수 없습니다.');
    }
} // 이 부분의 닫는 괄호를 정리했습니다.
}