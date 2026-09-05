const pool = require('../config/db');

// Admin: create exam
exports.createExam = async (req, res) => {
  const {
    exam_name, description, instructions, duration_minutes,
    total_marks, passing_marks, negative_marking,
    negative_marks_per_question, attempt_limit, is_free
  } = req.body;

  if (!exam_name || !duration_minutes || !total_marks) {
    return res.status(400).json({ success: false, message: 'exam_name, duration_minutes and total_marks are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO exams
        (exam_name, description, instructions, duration_minutes, total_marks, passing_marks,
         negative_marking, negative_marks_per_question, attempt_limit, is_free, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published')
       RETURNING *`,
      [exam_name, description, instructions, duration_minutes, total_marks, passing_marks || null,
       negative_marking || false, negative_marks_per_question || 0, attempt_limit || 1, is_free !== false]
    );
    res.status(201).json({ success: true, exam: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Candidate/public: list all published exams
exports.listExams = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT exam_id, exam_name, description, duration_minutes, total_marks,
              passing_marks, is_free, status, start_datetime, end_datetime
       FROM exams WHERE status = 'published' ORDER BY created_at DESC`
    );
    res.json({ success: true, exams: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Get single exam details
exports.getExamById = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM exams WHERE exam_id = $1', [exam_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    res.json({ success: true, exam: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: update exam
exports.updateExam = async (req, res) => {
  const { exam_id } = req.params;
  const {
    exam_name, description, instructions, duration_minutes,
    total_marks, passing_marks, negative_marking,
    negative_marks_per_question, attempt_limit, is_free, status
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE exams SET
        exam_name = COALESCE($1, exam_name),
        description = COALESCE($2, description),
        instructions = COALESCE($3, instructions),
        duration_minutes = COALESCE($4, duration_minutes),
        total_marks = COALESCE($5, total_marks),
        passing_marks = COALESCE($6, passing_marks),
        negative_marking = COALESCE($7, negative_marking),
        negative_marks_per_question = COALESCE($8, negative_marks_per_question),
        attempt_limit = COALESCE($9, attempt_limit),
        is_free = COALESCE($10, is_free),
        status = COALESCE($11, status),
        updated_at = NOW()
       WHERE exam_id = $12
       RETURNING *`,
      [exam_name, description, instructions, duration_minutes, total_marks, passing_marks,
       negative_marking, negative_marks_per_question, attempt_limit, is_free, status, exam_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    res.json({ success: true, exam: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: delete exam
exports.deleteExam = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM exams WHERE exam_id = $1 RETURNING exam_id', [exam_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    res.json({ success: true, message: 'Exam deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list ALL exams (including drafts) - for admin dashboard
exports.listAllExamsForAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT exam_id, exam_name, description, duration_minutes, total_marks,
              passing_marks, is_free, status, attempt_limit, created_at
       FROM exams ORDER BY created_at DESC`
    );
    res.json({ success: true, exams: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};