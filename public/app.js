let currentStep = 1;
let currentQIndex = 0;
let answers = [];
let diagnoses = [];

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

// 최종 제출 (qEEG 데이터 정보 포함)
async function submitAll() {
    const qeegInput = document.getElementById('qEegFile');
    const payload = {
        user_id: document.getElementById('nickname').value,
        age: parseInt(document.getElementById('age').value),
        gender: document.querySelector('input[name="gender"]:checked').value,
        diagnoses: diagnoses,
        answers: answers,
        qeeg_info: qeegInput.files[0] ? qeegInput.files[0].name : null // 파일 정보만 저장
    };
    
    // 서버 전송 로직...
}