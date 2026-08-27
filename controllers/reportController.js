const pool = require('../config/db');

// Exam-wise summary report
exports.examReport = async (req, res) => {
  const { exam_id } = req.params;
  try {
    const summary = await pool.query(
      `SELECT
         COUNT(*) AS total_attempts,
         AVG(total_score) AS average_score,
         MAX(total_score) AS highest_score,
         MIN(total_score) AS lowest_score,
         COUNT(CASE WHEN total_score >= (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS pass_count,
         COUNT(CASE WHEN total_score < (SELECT passing_marks FROM exams WHERE exam_id = $1) THEN 1 END) AS fail_count
       FROM exam_attempts
       WHERE exam_id = $1 AND status = 'submitted'`,
      [exam_id]
    );

    const candidates = await pool.query(
      `SELECT c.full_name, c.mobile_number, ea.total_score, ea.percentage, ea.end_time
       FROM exam_attempts ea
       JOIN candidates c ON c.candidate_id = ea.candidate_id
       WHERE ea.exam_id = $1 AND ea.status = 'submitted'
       ORDER BY ea.total_score DESC`,
      [exam_id]
    );

    res.json({
      success: true,
      summary: summary.rows[0],
      candidates: candidates.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Student-wise report (all exams taken by one candidate)
exports.studentReport = async (req, res) => {
  const { candidate_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT e.exam_name, ea.attempt_id, ea.total_score, ea.percentage, ea.status, ea.start_time, ea.end_time
       FROM exam_attempts ea
       JOIN exams e ON e.exam_id = ea.exam_id
       WHERE ea.candidate_id = $1
       ORDER BY ea.start_time DESC`,
      [candidate_id]
    );
    res.json({ success: true, attempts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Overall admin dashboard stats
exports.dashboardStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM candidates) AS total_candidates,
        (SELECT COUNT(*) FROM exams WHERE status = 'published') AS active_exams,
        (SELECT COUNT(*) FROM exam_attempts WHERE status = 'submitted') AS total_attempts,
        (SELECT COUNT(*) FROM exam_attempts WHERE status = 'in_progress') AS ongoing_attempts
    `);
    res.json({ success: true, stats: stats.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};