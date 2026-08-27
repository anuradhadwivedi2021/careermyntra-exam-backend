const pool = require('../config/db');

// Admin: add a question with options
exports.addQuestion = async (req, res) => {
  const { exam_id, question_text, subject, topic, difficulty, marks, negative_marks, explanation, options } = req.body;

  if (!exam_id || !question_text || !options || options.length < 2) {
    return res.status(400).json({ success: false, message: 'exam_id, question_text and at least 2 options are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const qResult = await client.query(
      `INSERT INTO questions (exam_id, question_text, subject, topic, difficulty, marks, negative_marks, explanation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING question_id`,
      [exam_id, question_text, subject || null, topic || null, difficulty || 'medium', marks || 1, negative_marks || 0, explanation || null]
    );
    const question_id = qResult.rows[0].question_id;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      await client.query(
        `INSERT INTO question_options (question_id, option_text, is_correct, option_order)
         VALUES ($1,$2,$3,$4)`,
        [question_id, opt.option_text, opt.is_correct || false, i + 1]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Question added', question_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
};

// Candidate: get questions for an exam (WITHOUT revealing correct answer)
exports.getQuestionsByExam = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const questions = await pool.query(
      `SELECT question_id, question_text, subject, topic, marks FROM questions WHERE exam_id = $1 ORDER BY question_id`,
      [exam_id]
    );

    const questionsWithOptions = await Promise.all(
      questions.rows.map(async (q) => {
        const options = await pool.query(
          `SELECT option_id, option_text FROM question_options WHERE question_id = $1 ORDER BY option_order`,
          [q.question_id]
        );
        return { ...q, options: options.rows };
      })
    );

    res.json({ success: true, questions: questionsWithOptions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};