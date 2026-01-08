const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json());

// 1. Cloud Run에 설정한 환경변수를 자동으로 불러옵니다.
const pool = new Pool({
  user: process.env.DB_USER,        // rhythmi_app
  password: process.env.DB_PASS,    // pattern05-SEEKER
  database: process.env.DB_NAME,    // RHYTHME
  host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
});

// 2. 데이터 저장 API 엔드포인트
app.post('/submit-survey', async (req, res) => {
  try {
    const { user_id, age, gender, answers } = req.body;

    // [기획 반영] 만 18세 이하는 아동/청소년(is_child = true)으로 자동 분류
    const isChild = parseInt(age) <= 18;
    
    // 점수 합산 로직 (0~30점)
    const totalScore = answers.reduce((a, b) => a + b, 0);
    
    // S_tag 분류 (MVP 기준)
    let sTag = 'S_low';
    if (totalScore >= 20) sTag = 'S_high';
    else if (totalScore >= 10) sTag = 'S_mid';

    const query = `
      INSERT INTO type_s_screener (
        user_id, age, gender, is_child,
        q1_spatial, q2_decision_alg, q3_linguistic, q4_causal, q5_social,
        q6_decision_alg, q7_physical, q8_biological, q9_paradigm, q10_reverse_eng,
        total_score, s_tag
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `;

    const values = [user_id, age, gender, isChild, ...answers, totalScore, sTag];
    await pool.query(query, values);

    res.status(200).json({
      success: true,
      message: `${isChild ? '아동/청소년' : '성인'} 데이터 저장 완료`,
      result: { totalScore, sTag }
    });
  } catch (err) {
    console.error('DB 저장 에러:', err);
    res.status(500).json({ success: false, error: '데이터 저장 중 오류 발생' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`RHYTHME 서버가 포트 ${PORT}에서 실행 중입니다.`);
});