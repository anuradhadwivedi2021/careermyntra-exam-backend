const pool = require('../config/db');

// Candidate: register for an exam
exports.registerForExam = async (req, res) => {
  const { exam_id } = req.body;
  const candidate_id = req.candidate.candidate_id;

  if (!exam_id) {
    return res.status(400).json({ success: false, message: 'exam_id is required' });
  }

  try {
    const examResult = await pool.query(
      `SELECT exam_id, status, start_datetime, end_datetime FROM exams WHERE exam_id = $1`,
      [exam_id]
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examResult.rows[0];
    if (exam.status !== 'published') {
      return res.status(400).json({ success: false, message: 'This exam is not open for registration' });
    }
    if (exam.end_datetime && new Date() > new Date(exam.end_datetime)) {
      return res.status(400).json({ success: false, message: 'Registration for this exam has closed' });
    }

    const existing = await pool.query(
      'SELECT registration_id FROM exam_registrations WHERE candidate_id = $1 AND exam_id = $2',
      [candidate_id, exam_id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Already registered for this exam' });
    }

    const result = await pool.query(
      `INSERT INTO exam_registrations (candidate_id, exam_id)
       VALUES ($1, $2) RETURNING registration_id, registered_at`,
      [candidate_id, exam_id]
    );

    res.status(201).json({
      success: true,
      message: 'Registered successfully',
      registration: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Candidate: list exam_ids they are registered for (used to toggle Register/Start button)
exports.myRegistrations = async (req, res) => {
  const candidate_id = req.candidate.candidate_id;
  try {
    const result = await pool.query(
      'SELECT exam_id, registered_at FROM exam_registrations WHERE candidate_id = $1',
      [candidate_id]
    );
    res.json({ success: true, registrations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list candidates registered for a given exam
exports.examRegistrations = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.registration_id, r.registered_at, c.candidate_id, c.full_name, c.mobile_number, c.email
       FROM exam_registrations r
       JOIN candidates c ON c.candidate_id = r.candidate_id
       WHERE r.exam_id = $1
       ORDER BY r.registered_at DESC`,
      [exam_id]
    );
    res.json({ success: true, registrations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};