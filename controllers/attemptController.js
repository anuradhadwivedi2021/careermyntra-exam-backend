const pool = require('../config/db');
const { runTestCases } = require('../services/codeExecutionService');
const { buildResultReportPdf } = require('../services/resultReportTemplate');
const { getClientIp, parseDeviceLabel } = require('../utils/deviceInfo');

// Start an exam attempt (or resume an existing in-progress one)
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
      'SELECT registration_id, status FROM exam_registrations WHERE candidate_id = $1 AND exam_id = $2',
      [candidate_id, exam_id]
    );
    if (registration.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Please register for this exam before starting it' });
    }
    if (registration.rows[0].status === 'pending') {
      return res.status(403).json({ success: false, message: 'Your registration is awaiting admin approval.' });
    }
    if (registration.rows[0].status === 'rejected') {
      return res.status(403).json({ success: false, message: 'Your registration for this exam was not approved.' });
    }

    // Resume an existing in-progress attempt if one hasn't expired yet
    const existingAttempt = await pool.query(
      `SELECT attempt_id, start_time, draft_answers FROM exam_attempts
       WHERE candidate_id = $1 AND exam_id = $2 AND status = 'in_progress'
       ORDER BY start_time DESC LIMIT 1`,
      [candidate_id, exam_id]
    );

    if (existingAttempt.rows.length > 0) {
      const existing = existingAttempt.rows[0];
      const elapsedSeconds = Math.floor((Date.now() - new Date(existing.start_time).getTime()) / 1000);
      const totalSeconds = exam.duration_minutes * 60;
      const remainingSeconds = totalSeconds - elapsedSeconds;

      if (remainingSeconds > 0) {
        return res.status(200).json({
          success: true,
          resumed: true,
          attempt_id: existing.attempt_id,
          start_time: existing.start_time,
          remaining_seconds: remainingSeconds,
          duration_minutes: exam.duration_minutes,
          total_marks: exam.total_marks,
          negative_marking: exam.negative_marking,
          negative_marks_per_question: exam.negative_marks_per_question,
          draft_answers: existing.draft_answers || [],
          proctoring: {
            enabled: exam.proctoring_enabled,
            require_camera: exam.require_camera,
            require_fullscreen: exam.require_fullscreen,
            require_id_verification: exam.require_id_verification,
            tab_switch_limit: exam.tab_switch_limit
          }
        });
      }
      // Time's up on the old attempt — auto-submit it before allowing a new one (if attempts remain)
      await autoSubmitExpiredAttempt(existing.attempt_id);
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
      `INSERT INTO exam_attempts (candidate_id, exam_id, status, ip_address, device_label)
       VALUES ($1, $2, 'in_progress', $3, $4) RETURNING attempt_id, start_time`,
      [candidate_id, exam_id, getClientIp(req), parseDeviceLabel(req.headers['user-agent'])]
    );

    res.status(201).json({
      success: true,
      resumed: false,
      attempt_id: attempt.rows[0].attempt_id,
      start_time: attempt.rows[0].start_time,
      remaining_seconds: exam.duration_minutes * 60,
      duration_minutes: exam.duration_minutes,
      total_marks: exam.total_marks,
      negative_marking: exam.negative_marking,
      negative_marks_per_question: exam.negative_marks_per_question,
      draft_answers: [],
      proctoring: {
        enabled: exam.proctoring_enabled,
        require_camera: exam.require_camera,
        require_fullscreen: exam.require_fullscreen,
        require_id_verification: exam.require_id_verification,
        tab_switch_limit: exam.tab_switch_limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Candidate: save progress mid-exam without scoring (called periodically by the frontend)
exports.saveProgress = async (req, res) => {
  const { attempt_id } = req.params;
  const { answers } = req.body;
  const candidate_id = req.candidate.candidate_id;

  try {
    const result = await pool.query(
      `UPDATE exam_attempts
       SET draft_answers = $1, last_saved_at = NOW()
       WHERE attempt_id = $2 AND candidate_id = $3 AND status = 'in_progress'
       RETURNING attempt_id`,
      [JSON.stringify(answers || []), attempt_id, candidate_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found or already submitted' });
    }
    res.json({ success: true, saved_at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Internal helper: force-submit an attempt whose time has run out, using whatever draft_answers were last saved
async function autoSubmitExpiredAttempt(attempt_id) {
  const client = await pool.connect();
  try {
    const attemptResult = await client.query('SELECT * FROM exam_attempts WHERE attempt_id = $1', [attempt_id]);
    if (attemptResult.rows.length === 0) return;
    const attempt = attemptResult.rows[0];
    if (attempt.status !== 'in_progress') return;

    const examResult = await client.query('SELECT * FROM exams WHERE exam_id = $1', [attempt.exam_id]);
    const exam = examResult.rows[0];
    const answers = attempt.draft_answers || [];

    await scoreAndSaveAttempt(client, attempt, exam, answers);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('autoSubmitExpiredAttempt failed for attempt', attempt_id, err);
  } finally {
    client.release();
  }
}

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

    const resultSummary = await scoreAndSaveAttempt(client, attempt, exam, answers || []);

    res.json({
      success: true,
      message: resultSummary.needs_evaluation ? 'Exam submitted. Subjective answers are pending evaluation.' : 'Exam submitted successfully',
      result: resultSummary
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};

// Shared scoring logic used by both the candidate-triggered submit and the
// server-triggered auto-submit (when a resumed attempt's time has run out).
async function scoreAndSaveAttempt(client, attempt, exam, answers) {
  const attempt_id = attempt.attempt_id;
  const candidate_id = attempt.candidate_id;

  const allQuestions = await client.query(
    'SELECT question_id, marks, negative_marks, question_type, time_limit_seconds, word_limit FROM questions WHERE exam_id = $1',
    [attempt.exam_id]
  );

  // Run coding answers against ALL test cases (including hidden) BEFORE opening the
  // transaction, since code execution can be slow and shouldn't hold a DB transaction open.
  const codingAnswers = (answers || []).filter((ans) => {
    const q = allQuestions.rows.find((qq) => qq.question_id === ans.question_id);
    return q && q.question_type === 'coding';
  });
  const codingResultsByQuestion = {};
  for (const ans of codingAnswers) {
    const question = allQuestions.rows.find((q) => q.question_id === ans.question_id);
    const testCases = await client.query(
      `SELECT test_case_id, input, expected_output, is_hidden FROM coding_test_cases WHERE question_id = $1 ORDER BY test_case_id ASC`,
      [ans.question_id]
    );
    if (testCases.rows.length === 0 || !ans.code || !ans.language) {
      codingResultsByQuestion[ans.question_id] = { results: [], passedCount: 0, totalCount: testCases.rows.length };
      continue;
    }
    const results = await runTestCases(ans.code, ans.language, testCases.rows, question.time_limit_seconds || 2);
    const passedCount = results.filter((r) => r.passed).length;
    codingResultsByQuestion[ans.question_id] = { results, passedCount, totalCount: testCases.rows.length };
  }

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

      // Enforce word_limit server-side (frontend may not always enforce it,
      // and this is the final line of defense before it's stored for
      // evaluation). Truncate rather than reject — rejecting at final submit
      // would strand the candidate mid-exam. The evaluator is told via
      // remarks that truncation happened, so it's visible during grading.
      let answerText = ans.answer_text || '';
      let wordLimitNote = null;
      if (question.word_limit) {
        const words = answerText.trim().split(/\s+/).filter(Boolean);
        if (words.length > question.word_limit) {
          answerText = words.slice(0, question.word_limit).join(' ');
          wordLimitNote = `Answer exceeded the ${question.word_limit}-word limit (submitted ${words.length} words) and was truncated.`;
        }
      }

      await client.query(
        `INSERT INTO candidate_answers (attempt_id, question_id, answer_text, is_evaluated, marks_awarded, remarks)
         VALUES ($1,$2,$3,false,0,$4)
         ON CONFLICT (attempt_id, question_id) DO UPDATE
         SET answer_text = $3, is_evaluated = false, marks_awarded = 0, remarks = $4`,
        [attempt_id, ans.question_id, answerText, wordLimitNote]
      );
      continue;
    }

    if (question.question_type === 'coding') {
      const outcome = codingResultsByQuestion[ans.question_id] || { results: [], passedCount: 0, totalCount: 0 };
      const passRatio = outcome.totalCount > 0 ? outcome.passedCount / outcome.totalCount : 0;
      const marksAwarded = parseFloat(question.marks) * passRatio;
      const isFullyCorrect = outcome.totalCount > 0 && outcome.passedCount === outcome.totalCount;

      totalScore += marksAwarded;
      if (isFullyCorrect) correctCount++; else incorrectCount++;

      await client.query(
        `INSERT INTO candidate_answers (attempt_id, question_id, answer_text, language, test_case_results, is_correct, marks_awarded, is_evaluated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         ON CONFLICT (attempt_id, question_id) DO UPDATE
         SET answer_text = $3, language = $4, test_case_results = $5, is_correct = $6, marks_awarded = $7, is_evaluated = true`,
        [attempt_id, ans.question_id, ans.code || '', ans.language || null, JSON.stringify(outcome.results), isFullyCorrect, marksAwarded]
      );
      continue;
    }

    if (question.question_type === 'multi_select') {
      const selectedIds = Array.isArray(ans.selected_option_ids) ? ans.selected_option_ids : [];
      const optionsResult = await client.query(
        'SELECT option_id, is_correct FROM question_options WHERE question_id = $1',
        [ans.question_id]
      );
      const correctIds = optionsResult.rows.filter((o) => o.is_correct).map((o) => o.option_id);
      const correctSet = new Set(correctIds);
      const selectedSet = new Set(selectedIds);
      const isExactMatch = correctSet.size === selectedSet.size && [...correctSet].every((id) => selectedSet.has(id));

      let marksAwarded = 0;
      if (isExactMatch) {
        marksAwarded = parseFloat(question.marks);
        correctCount++;
      } else {
        marksAwarded = exam.negative_marking ? -parseFloat(question.negative_marks) : 0;
        incorrectCount++;
      }
      totalScore += marksAwarded;

      await client.query(
        `INSERT INTO candidate_answers (attempt_id, question_id, selected_option_ids, is_correct, marks_awarded, is_evaluated)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (attempt_id, question_id) DO UPDATE
         SET selected_option_ids = $3, is_correct = $4, marks_awarded = $5, is_evaluated = true`,
        [attempt_id, ans.question_id, selectedIds, isExactMatch, marksAwarded]
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
     SET status = 'submitted', end_time = NOW(), total_score = $1, percentage = $2, needs_evaluation = $3, draft_answers = NULL
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

  return {
    total_questions: allQuestions.rows.length,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    unattempted_count: unattemptedCount,
    total_score: totalScore,
    percentage: percentage.toFixed(2),
    rank: myRank.rows[0].rank,
    needs_evaluation: needsEvaluation
  };
}

// Shared: builds the full result detail (summary + sections + question-wise
// breakdown) used by both the JSON result endpoint and the PDF download.
// Returns { pending: true, message } if the admin has held back the result,
// otherwise the full detail object.
async function buildResultDetail(attempt_id, candidate_id) {
  const result = await pool.query(
    `SELECT r.*, a.needs_evaluation, a.start_time, a.end_time,
            e.exam_name, e.duration_minutes, e.total_marks, e.passing_marks,
            e.show_result_immediately, e.show_correct_answers, e.show_explanation,
            e.show_rank, e.show_section_analysis, e.show_detailed_report, e.result_publish_at
     FROM results r
     JOIN exam_attempts a ON a.attempt_id = r.attempt_id
     JOIN exams e ON e.exam_id = r.exam_id
     WHERE r.attempt_id = $1 AND r.candidate_id = $2`,
    [attempt_id, candidate_id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Result not found');
    err.status = 404;
    throw err;
  }

  const row = result.rows[0];

  if (row.show_result_immediately === false) {
    return { pending: true, message: 'Your result will be published by the exam admin soon.' };
  }

  // Admin scheduled a specific future date/time for this exam's results —
  // hold back the result until that moment passes, even if
  // show_result_immediately is true.
  if (row.result_publish_at && new Date() < new Date(row.result_publish_at)) {
    return {
      pending: true,
      message: `Your result will be published on ${new Date(row.result_publish_at).toLocaleString()}.`,
    };
  }

  if (row.show_rank === false) row.rank = null;

  row.time_taken_seconds = row.end_time && row.start_time
    ? Math.max(0, Math.round((new Date(row.end_time) - new Date(row.start_time)) / 1000))
    : null;
  row.duration_seconds = row.duration_minutes * 60;

  // Every question in the exam, left-joined with this attempt's answer (no
  // row = unattempted) and the question's options (for correct/selected text).
  const questionsResult = await pool.query(
    `SELECT q.question_id, q.question_text, q.question_type, q.subject, q.marks, q.negative_marks,
            q.explanation,
            ca.answer_id, ca.selected_option_id, ca.selected_option_ids, ca.answer_text,
            ca.language, ca.is_correct, ca.is_evaluated, ca.marks_awarded
     FROM questions q
     LEFT JOIN candidate_answers ca ON ca.question_id = q.question_id AND ca.attempt_id = $1
     WHERE q.exam_id = $2
     ORDER BY q.question_id ASC`,
    [attempt_id, row.exam_id]
  );

  const optionsResult = await pool.query(
    `SELECT question_id, option_id, option_text, is_correct
     FROM question_options WHERE question_id = ANY($1::int[]) ORDER BY option_order ASC`,
    [questionsResult.rows.map((q) => q.question_id)]
  );
  const optionsByQuestion = {};
  for (const opt of optionsResult.rows) {
    if (!optionsByQuestion[opt.question_id]) optionsByQuestion[opt.question_id] = [];
    optionsByQuestion[opt.question_id].push(opt);
  }

  const sectionsMap = {};
  const questions = questionsResult.rows.map((q, idx) => {
    const options = optionsByQuestion[q.question_id] || [];
    const isAttempted = q.answer_id != null;
    const isPendingEvaluation = q.question_type === 'subjective' && isAttempted && q.is_evaluated === false;

    let yourAnswer = null;
    let correctAnswer = null;

    if (q.question_type === 'mcq' || q.question_type === 'true_false') {
      yourAnswer = isAttempted ? (options.find((o) => o.option_id === q.selected_option_id)?.option_text ?? '(no answer)') : null;
      correctAnswer = options.find((o) => o.is_correct)?.option_text ?? null;
    } else if (q.question_type === 'multi_select') {
      const selectedIds = q.selected_option_ids || [];
      yourAnswer = isAttempted ? options.filter((o) => selectedIds.includes(o.option_id)).map((o) => o.option_text).join(', ') || '(no answer)' : null;
      correctAnswer = options.filter((o) => o.is_correct).map((o) => o.option_text).join(', ') || null;
    } else if (q.question_type === 'subjective') {
      yourAnswer = q.answer_text || null;
      correctAnswer = null; // manually evaluated, no fixed correct answer
    } else if (q.question_type === 'coding') {
      yourAnswer = q.answer_text ? `[${q.language || 'code'}]\n${q.answer_text}` : null;
      correctAnswer = null;
    }

    const subjectKey = q.subject || 'General';
    if (!sectionsMap[subjectKey]) {
      sectionsMap[subjectKey] = { subject: subjectKey, total: 0, correct: 0, incorrect: 0, unattempted: 0, marks_obtained: 0, max_marks: 0 };
    }
    const section = sectionsMap[subjectKey];
    section.total += 1;
    section.max_marks += parseFloat(q.marks) || 0;
    section.marks_obtained += parseFloat(q.marks_awarded) || 0;
    if (!isAttempted) section.unattempted += 1;
    else if (isPendingEvaluation) { /* not yet counted either way */ }
    else if (q.is_correct) section.correct += 1;
    else section.incorrect += 1;

    return {
      question_id: q.question_id,
      question_number: idx + 1,
      question_text: q.question_text,
      question_type: q.question_type,
      subject: subjectKey,
      marks: parseFloat(q.marks) || 0,
      negative_marks: parseFloat(q.negative_marks) || 0,
      marks_awarded: q.marks_awarded != null ? parseFloat(q.marks_awarded) : 0,
      is_attempted: isAttempted,
      is_correct: isPendingEvaluation ? null : (isAttempted ? !!q.is_correct : null),
      is_pending_evaluation: isPendingEvaluation,
      your_answer: yourAnswer,
      correct_answer: row.show_correct_answers === false ? null : correctAnswer,
      explanation: row.show_explanation === false ? null : (q.explanation || null),
    };
  });

  row.sections = row.show_section_analysis === false ? [] : Object.values(sectionsMap);
  row.questions = row.show_detailed_report === false ? [] : questions;

  return row;
}

// Get result for an attempt
exports.getResult = async (req, res) => {
  const { attempt_id } = req.params;
  const candidate_id = req.candidate.candidate_id;

  try {
    const detail = await buildResultDetail(attempt_id, candidate_id);
    if (detail.pending) {
      return res.json({ success: true, result_pending_release: true, message: detail.message });
    }
    res.json({ success: true, result: detail });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Download the same result as a PDF
exports.getResultPdf = async (req, res) => {
  const { attempt_id } = req.params;
  const candidate_id = req.candidate.candidate_id;

  try {
    const detail = await buildResultDetail(attempt_id, candidate_id);
    if (detail.pending) {
      return res.status(400).json({ success: false, message: detail.message });
    }

    const candidateResult = await pool.query('SELECT full_name FROM candidates WHERE candidate_id = $1', [candidate_id]);
    const pdfBuffer = buildResultReportPdf(detail, candidateResult.rows[0]?.full_name || 'Candidate');

    const safeName = (candidateResult.rows[0]?.full_name || 'candidate').replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Result_${safeName}_${attempt_id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
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