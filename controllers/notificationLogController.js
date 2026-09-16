const pool = require('../config/db');

// ============ LIST SMS LOGS (admin) ============
exports.listSmsLogs = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause = status ? 'WHERE status = $1' : '';
    const params = status ? [status, Number(limit), offset] : [Number(limit), offset];
    const limitIdx = status ? 2 : 1;
    const offsetIdx = status ? 3 : 2;

    const result = await pool.query(
      `SELECT * FROM sms_logs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sms_logs ${whereClause}`,
      status ? [status] : []
    );

    const summary = await pool.query(
      `SELECT status, COUNT(*) FROM sms_logs GROUP BY status`
    );

    res.json({
      success: true,
      logs: result.rows,
      total: Number(countResult.rows[0].count),
      summary: summary.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load SMS logs', error: err.message });
  }
};

// ============ LIST EMAIL LOGS (admin) ============
exports.listEmailLogs = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause = status ? 'WHERE status = $1' : '';
    const params = status ? [status, Number(limit), offset] : [Number(limit), offset];
    const limitIdx = status ? 2 : 1;
    const offsetIdx = status ? 3 : 2;

    const result = await pool.query(
      `SELECT * FROM email_logs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM email_logs ${whereClause}`,
      status ? [status] : []
    );

    const summary = await pool.query(
      `SELECT status, COUNT(*) FROM email_logs GROUP BY status`
    );

    res.json({
      success: true,
      logs: result.rows,
      total: Number(countResult.rows[0].count),
      summary: summary.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load email logs', error: err.message });
  }
};