const pool = require('../config/db');

// ============ LIST RECENT LOGIN SESSIONS (admin) ============
exports.listSessions = async (req, res) => {
  try {
    const { flagged_only, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause = flagged_only === 'true'
      ? "WHERE s.logged_out_reason = 'new_login_elsewhere'"
      : '';

    const result = await pool.query(
      `SELECT s.session_id, s.candidate_id, c.full_name, c.mobile_number,
              s.ip_address, s.device_label, s.is_active, s.login_at,
              s.last_seen_at, s.logged_out_at, s.logged_out_reason
       FROM candidate_sessions s
       JOIN candidates c ON c.candidate_id = s.candidate_id
       ${whereClause}
       ORDER BY s.login_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM candidate_sessions s ${whereClause}`
    );

    const flaggedCount = await pool.query(
      `SELECT COUNT(*) FROM candidate_sessions WHERE logged_out_reason = 'new_login_elsewhere'`
    );

    res.json({
      success: true,
      sessions: result.rows,
      total: Number(countResult.rows[0].count),
      flagged_count: Number(flaggedCount.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load sessions', error: err.message });
  }
};

// ============ IP/DEVICE FOR ONE EXAM ATTEMPT (admin) ============
exports.getAttemptSecurityInfo = async (req, res) => {
  const { attempt_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT attempt_id, candidate_id, ip_address, device_label, start_time, end_time
       FROM exam_attempts WHERE attempt_id = $1`,
      [attempt_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }
    res.json({ success: true, attempt: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};