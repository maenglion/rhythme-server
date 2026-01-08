const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // Netlify 통신을 위해 필수
const app = express();

app.use(cors()); // CORS 허용
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
});

app.post('/submit-survey', async (req, res) => {
  try {
    // 프론트엔드 payload 구조와 일치시킴
    const { user_id, age, gender, diagnoses, answers, qeeg_info } = req.body;

    const isChild = parseInt(age) <= 18;
    const totalScore = answers.reduce((a, b) => a + b, 0);
    
    let sTag = 'S_low';
    if (totalScore >= 20) sTag = 'S_high';
    else if (totalScore >= 10) sTag = 'S_mid';

    // 컬럼명과 개수를 데이터베이스 스키마와 정확히 일치시킴
    const query = `
      INSERT INTO type_s_screener (
        user_id, age, gender, is_child, diagnoses,
        q1_spatial, q2_decision_alg, q3_linguistic, q4_causal, q5_social,
        q6_decision_alg, q7_physical, q8_biological, q9_paradigm, q10_reverse_eng,
        total_score, s_tag, qeeg_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `;

    // diagnoses 배열을 JSON 문자열로 변환하여 저장
    const values = [
      user_id, age, gender, isChild, JSON.stringify(diagnoses),
      ...answers, totalScore, sTag, qeeg_info
    ];

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