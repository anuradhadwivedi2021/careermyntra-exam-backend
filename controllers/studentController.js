const pool = require('../config/db');
const bcrypt = require('bcrypt');

// ============ LIST STUDENTS (with search) ============
exports.listStudents = async (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : null;
  try {
    const result = await pool.query(
      `SELECT c.candidate_id, c.full_name, c.mobile_number, c.email,
              c.mobile_verified, c.is_active, c.created_at,
              COUNT(a.attempt_id)::int AS attempt_count
       FROM candidates c
       LEFT JOIN exam_attempts a ON a.candidate_id = c.candidate_id
       WHERE ($1::text IS NULL OR c.full_name ILIKE $1 OR c.mobile_number ILIKE $1 OR c.email ILIKE $1)
       GROUP BY c.candidate_id
       ORDER BY c.created_at DESC`,
      [search]
    );
    res.json({ success: true, students: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ GET ONE STUDENT (profile + attempt history) ============
exports.getStudent = async (req, res) => {
  const { student_id } = req.params;
  try {
    const studentResult = await pool.query(
      `SELECT candidate_id, full_name, mobile_number, email, mobile_verified, is_active, created_at
       FROM candidates WHERE candidate_id = $1`,
      [student_id]
    );
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const attemptsResult = await pool.query(
      `SELECT a.attempt_id, e.exam_name, a.status, a.total_score, a.percentage, a.start_time, a.end_time
       FROM exam_attempts a
       JOIN exams e ON e.exam_id = a.exam_id
       WHERE a.candidate_id = $1
       ORDER BY a.start_time DESC`,
      [student_id]
    );

    res.json({ success: true, student: studentResult.rows[0], attempts: attemptsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ UPDATE STUDENT (name/email/active status) ============
exports.updateStudent = async (req, res) => {
  const { student_id } = req.params;
  const { full_name, email, is_active } = req.body;

  if (!full_name) {
    return res.status(400).json({ success: false, message: 'full_name is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE candidates SET full_name = $1, email = $2, is_active = $3, updated_at = NOW()
       WHERE candidate_id = $4
       RETURNING candidate_id, full_name, mobile_number, email, mobile_verified, is_active`,
      [full_name, email || null, is_active, student_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, message: 'Student updated', student: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ RESET STUDENT PASSWORD (admin support action) ============
exports.resetStudentPassword = async (req, res) => {
  const { student_id } = req.params;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  try {
    const password_hash = await bcrypt.hash(new_password, 10);
    const result = await pool.query(
      `UPDATE candidates SET password_hash = $1, updated_at = NOW() WHERE candidate_id = $2 RETURNING candidate_id`,
      [password_hash, student_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, message: 'Password reset' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};