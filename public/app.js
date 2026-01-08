let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];

const CLOUD_RUN_URL = "https://rhythme-server-357918245340.asia-northeast3.run.app/"
const childQuestions = [...]; // PDF의 10문항
const adultQuestions = [...]; // 성인용 10문항


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