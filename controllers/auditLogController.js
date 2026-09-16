const pool = require('../config/db');

// ============ ADMIN: LIST AUDIT LOG ENTRIES (filterable, for the audit-log page) ============
exports.getLogs = async (req, res) => {
  const { module, admin, search, limit = 200 } = req.query;

  const conditions = [];
  const values = [];

  if (module && module !== 'All modules') {
    values.push(module);
    conditions.push(`module = $${values.length}`);
  }
  if (admin && admin !== 'All admins') {
    values.push(admin);
    conditions.push(`admin_name = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`action ILIKE $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(Math.min(parseInt(limit, 10) || 200, 1000));

  try {
    const result = await pool.query(
      `SELECT log_id, admin_id, admin_name, action, module, ip_address, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values
    );

    // Distinct admin/module lists for the filter dropdowns
    const [adminsResult, modulesResult] = await Promise.all([
      pool.query('SELECT DISTINCT admin_name FROM audit_logs ORDER BY admin_name'),
      pool.query('SELECT DISTINCT module FROM audit_logs ORDER BY module'),
    ]);

    res.json({
      success: true,
      logs: result.rows,
      admins: adminsResult.rows.map((r) => r.admin_name),
      modules: modulesResult.rows.map((r) => r.module),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};