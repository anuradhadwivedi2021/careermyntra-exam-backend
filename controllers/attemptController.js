const pool = require('../config/db');

// Start an exam attempt
exports.startAttempt = async (req, res) => {
  const { exam_id } = req.body;
  const candidate_id = req.candidate.candidate_id;

  if (!exam_id) {
    return res.status(400).json({ success: false, message: 'exam_id is required' });
  }

  try {
    const examResult = await pool.query('SELECT * FROM exams WHERE exam_id = $1', [exam_id]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examResult.rows[0];

    const registration = await pool.query(
      'SELECT registration_id FROM exam_registrations WHERE candidate_id = $1 AND exam_id = $2',
      [candidate_id, exam_id]
    );
    if (registration.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Please register for this exam before starting it' });
    }

    const pastAttempts = await pool.query(
      'SELECT COUNT(*) FROM exam_attempts WHERE candidate_id = $1 AND exam_id = $2',
      [candidate_id, exam_id]
    );
    const attemptCount = parseInt(pastAttempts.rows[0].count);

    if (attemptCount >= exam.attempt_limit) {
      return res.status(403).json({ success: false, message: 'Attempt limit reached for this exam' });
    }

    const attempt = await pool.query(
      `INSERT INTO exam_attempts (candidate_id, exam_id, status)
       VALUES ($1, $2, 'in_progress') RETURNING attempt_id, start_time`,
      [candidate_id, exam_id]
    );

    res.status(201).json({
      success: true,
      attempt_id: attempt.rows[0].attempt_id,
      start_time: attempt.rows[0].start_time,
      duration_minutes: exam.duration_minutes,
      total_marks: exam.total_marks,
      negative_marking: exam.negative_marking,
      negative_marks_per_question: exam.negative_marks_per_question
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Submit answers and auto-evaluate
exports.submitAttempt = async (req, res) => {
  const { attempt_id } = req.params;
  const { answers } = req.body; // [{ question_id, selected_option_id }]
  const candidate_id = req.candidate.candidate_id;

  const client = await pool.connect();
  try {
    const attemptResult = await client.query(
      'SELECT * FROM exam_attempts WHERE attempt_id = $1 AND candidate_id = $2',
      [attempt_id, candidate_id]
    );
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }
    const attempt = attemptResult.rows[0];
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'This attempt is already submitted' });
    }

    const examResult = await client.query('SELECT * FROM exams WHERE exam_id = $1', [attempt.exam_id]);
    const exam = examResult.rows[0];

    const allQuestions = await client.query(
      'SELECT question_id, marks, negative_marks, question_type FROM questions WHERE exam_id = $1',
      [attempt.exam_id]
    );

    await client.query('BEGIN');

    let totalScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let pendingSubjectiveCount = 0;
    const answeredQuestionIds = new Set();

    for (const ans of answers || []) {
      const question = allQuestions.rows.find(q => q.question_id === ans.question_id);
      if (!question) continue;

      answeredQuestionIds.add(ans.question_id);

      if (question.question_type === 'subjective') {
        pendingSubjectiveCount++;
        await client.query(
          `INSERT INTO candidate_answers (attempt_id, question_id, answer_text, is_evaluated, marks_awarded)
           VALUES ($1,$2,$3,false,0)
           ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET answer_text = $3, is_evaluated = false, marks_awarded = 0`,
          [attempt_id, ans.question_id, ans.answer_text || '']
        );
        continue;
      }

      const optionResult = await client.query(
        'SELECT is_correct FROM question_options WHERE option_id = $1 AND question_id = $2',
        [ans.selected_option_id, ans.question_id]
      );

      let isCorrect = false;
      let marksAwarded = 0;

      if (optionResult.rows.length > 0) {
        isCorrect = optionResult.rows[0].is_correct;
        if (isCorrect) {
          marksAwarded = parseFloat(question.marks);
          correctCount++;
        } else {
          marksAwarded = exam.negative_marking ? -parseFloat(question.negative_marks) : 0;
          incorrectCount++;
        }
      }

      totalScore += marksAwarded;

      await client.query(
        `INSERT INTO candidate_answers (attempt_id, question_id, selected_option_id, is_correct, marks_awarded, is_evaluated)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (attempt_id, question_id) DO UPDATE
         SET selected_option_id = $3, is_correct = $4, marks_awarded = $5, is_evaluated = true`,
        [attempt_id, ans.question_id, ans.selected_option_id, isCorrect, marksAwarded]
      );
    }

    const needsEvaluation = pendingSubjectiveCount > 0;
    const unattemptedCount = allQuestions.rows.length - answeredQuestionIds.size;
    const percentage = exam.total_marks > 0 ? (totalScore / exam.total_marks) * 100 : 0;

    await client.query(
      `UPDATE exam_attempts
       SET status = 'submitted', end_time = NOW(), total_score = $1, percentage = $2, needs_evaluation = $3
       WHERE attempt_id = $4`,
      [totalScore, percentage, needsEvaluation, attempt_id]
    );

    const insertedResult = await client.query(
      `INSERT INTO results
        (attempt_id, candidate_id, exam_id, total_questions, correct_count, incorrect_count, unattempted_count, total_score, percentage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING result_id`,
      [attempt_id, candidate_id, attempt.exam_id, allQuestions.rows.length, correctCount, incorrectCount, unattemptedCount, totalScore, percentage]
    );

    // Recompute rank for every candidate on this exam (highest score = rank 1)
    await client.query(
      `UPDATE results r
       SET rank = ranked.rnk
       FROM (
         SELECT result_id, RANK() OVER (ORDER BY total_score DESC) AS rnk
         FROM results WHERE exam_id = $1
       ) ranked
       WHERE r.result_id = ranked.result_id`,
      [attempt.exam_id]
    );

    const myRank = await client.query(
      'SELECT rank FROM results WHERE result_id = $1',
      [insertedResult.rows[0].result_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: needsEvaluation ? 'Exam submitted. Subjective answers are pending evaluation.' : 'Exam submitted successfully',
      result: {
        total_questions: allQuestions.rows.length,
        correct_count: correctCount,
        incorrect_count: incorrectCount,
        unattempted_count: unattemptedCount,
        total_score: totalScore,
        percentage: percentage.toFixed(2),
        rank: myRank.rows[0].rank,
        needs_evaluation: needsEvaluation
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};

// Get result for an attempt
exports.getResult = async (req, res) => {
  const { attempt_id } = req.params;
  const candidate_id = req.candidate.candidate_id;

  try {
    const result = await pool.query(
      `SELECT r.*, a.needs_evaluation
       FROM results r
       JOIN exam_attempts a ON a.attempt_id = r.attempt_id
       WHERE r.attempt_id = $1 AND r.candidate_id = $2`,
      [attempt_id, candidate_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    res.json({ success: true, result: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list attempts pending subjective evaluation
exports.listPendingEvaluations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.attempt_id, a.exam_id, a.end_time, e.exam_name, c.candidate_id, c.full_name, c.mobile_number
       FROM exam_attempts a
       JOIN exams e ON e.exam_id = a.exam_id
       JOIN candidates c ON c.candidate_id = a.candidate_id
       WHERE a.needs_evaluation = true
       ORDER BY a.end_time ASC`
    );
    res.json({ success: true, attempts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: get one attempt's subjective answers for evaluation
exports.getAttemptForEvaluation = async (req, res) => {
  const { attempt_id } = req.params;
  try {
    const attemptResult = await pool.query(
      `SELECT a.attempt_id, a.exam_id, e.exam_name, c.full_name, c.mobile_number
       FROM exam_attempts a
       JOIN exams e ON e.exam_id = a.exam_id
       JOIN candidates c ON c.candidate_id = a.candidate_id
       WHERE a.attempt_id = $1`,
      [attempt_id]
    );
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const answers = await pool.query(
      `SELECT ca.question_id, ca.answer_text, ca.marks_awarded, ca.is_evaluated, ca.remarks,
              q.question_text, q.marks AS max_marks
       FROM candidate_answers ca
       JOIN questions q ON q.question_id = ca.question_id
       WHERE ca.attempt_id = $1 AND q.question_type = 'subjective'
       ORDER BY q.question_id`,
      [attempt_id]
    );

    res.json({ success: true, attempt: attemptResult.rows[0], answers: answers.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: submit evaluation marks for subjective answers, recompute score/rank
exports.evaluateAttempt = async (req, res) => {
  const { attempt_id } = req.params;
  const { evaluations } = req.body; // [{ question_id, marks_awarded, remarks }]

  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    return res.status(400).json({ success: false, message: 'evaluations array is required' });
  }

  const client = await pool.connect();
  try {
    const attemptResult = await client.query('SELECT * FROM exam_attempts WHERE attempt_id = $1', [attempt_id]);
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }
    const attempt = attemptResult.rows[0];

    await client.query('BEGIN');

    for (const ev of evaluations) {
      await client.query(
        `UPDATE candidate_answers
         SET marks_awarded = $1, remarks = $2, is_evaluated = true
         WHERE attempt_id = $3 AND question_id = $4`,
        [ev.marks_awarded || 0, ev.remarks || null, attempt_id, ev.question_id]
      );
    }

    const remainingUnevaluated = await client.query(
      `SELECT COUNT(*) FROM candidate_answers WHERE attempt_id = $1 AND is_evaluated = false`,
      [attempt_id]
    );
    const stillPending = parseInt(remainingUnevaluated.rows[0].count) > 0;

    const scoreResult = await client.query(
      `SELECT COALESCE(SUM(marks_awarded), 0) AS total FROM candidate_answers WHERE attempt_id = $1`,
      [attempt_id]
    );
    const totalScore = parseFloat(scoreResult.rows[0].total);

    const examResult = await client.query('SELECT total_marks FROM exams WHERE exam_id = $1', [attempt.exam_id]);
    const percentage = examResult.rows[0].total_marks > 0 ? (totalScore / examResult.rows[0].total_marks) * 100 : 0;

    await client.query(
      `UPDATE exam_attempts SET total_score = $1, percentage = $2, needs_evaluation = $3 WHERE attempt_id = $4`,
      [totalScore, percentage, stillPending, attempt_id]
    );

    await client.query(
      `UPDATE results SET total_score = $1, percentage = $2, generated_at = NOW() WHERE attempt_id = $3`,
      [totalScore, percentage, attempt_id]
    );

    await client.query(
      `UPDATE results r
       SET rank = ranked.rnk
       FROM (
         SELECT result_id, RANK() OVER (ORDER BY total_score DESC) AS rnk
         FROM results WHERE exam_id = $1
       ) ranked
       WHERE r.result_id = ranked.result_id`,
      [attempt.exam_id]
    );

    await client.query('COMMIT');

    res.json({ success: true, message: 'Evaluation saved', total_score: totalScore, percentage: percentage.toFixed(2), still_pending: stillPending });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};