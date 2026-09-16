const pool = require('../config/db');

// Call this from any controller right after a successful admin write action.
// Never throws — a logging failure should never break the actual request.
//
// Usage:
//   const { logAction } = require('../services/auditLogger');
//   await logAction(req, { action: 'Updated branding colours', module: 'Settings' });
async function logAction(req, { action, module }) {
  try {
    const admin = req.admin || {};
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || null;

    // The JWT payload only carries admin_id/email/role, not full_name — look it up.
    let admin_name = admin.email || 'Unknown admin';
    if (admin.admin_id) {
      const nameResult = await pool.query('SELECT full_name FROM admins WHERE admin_id = $1', [admin.admin_id]);
      if (nameResult.rows.length > 0) admin_name = nameResult.rows[0].full_name;
    }

    await pool.query(
      `INSERT INTO audit_logs (admin_id, admin_name, action, module, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin.admin_id || null, admin_name, action, module, ip]
    );
  } catch (err) {
    console.error('audit log write failed:', err.message);
  }
}

module.exports = { logAction };