const pool = require('../config/db');
const { logAction } = require('../services/auditLogger');

// ============ GET SETTINGS (public — used by admin pages to load current values,
//               and can be used by the public site later to render branding) ============
exports.getSettings = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings WHERE id = 1');
    if (result.rows.length === 0) {
      // Should not happen since migration seeds row 1, but guard anyway
      const inserted = await pool.query('INSERT INTO system_settings (id) VALUES (1) RETURNING *');
      return res.json({ success: true, settings: inserted.rows[0] });
    }
    res.json({ success: true, settings: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: UPDATE GENERAL SETTINGS ============
exports.updateGeneral = async (req, res) => {
  const {
    site_name, support_email, support_phone, timezone, currency,
    maintenance_mode, allow_registrations, otp_login,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE system_settings SET
        site_name = COALESCE($1, site_name),
        support_email = COALESCE($2, support_email),
        support_phone = COALESCE($3, support_phone),
        timezone = COALESCE($4, timezone),
        currency = COALESCE($5, currency),
        maintenance_mode = COALESCE($6, maintenance_mode),
        allow_registrations = COALESCE($7, allow_registrations),
        otp_login = COALESCE($8, otp_login),
        updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [site_name, support_email, support_phone, timezone, currency, maintenance_mode, allow_registrations, otp_login]
    );
    await logAction(req, { action: 'Updated general settings', module: 'Settings' });
    res.json({ success: true, message: 'General settings saved', settings: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ ADMIN: UPDATE BRANDING SETTINGS ============
exports.updateBranding = async (req, res) => {
  const {
    brand_name, tagline, footer_tagline, primary_color, secondary_color, logo_url, favicon_url,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE system_settings SET
        brand_name = COALESCE($1, brand_name),
        tagline = COALESCE($2, tagline),
        footer_tagline = COALESCE($3, footer_tagline),
        primary_color = COALESCE($4, primary_color),
        secondary_color = COALESCE($5, secondary_color),
        logo_url = COALESCE($6, logo_url),
        favicon_url = COALESCE($7, favicon_url),
        updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [brand_name, tagline, footer_tagline, primary_color, secondary_color, logo_url, favicon_url]
    );
    await logAction(req, { action: 'Updated branding settings', module: 'Settings' });
    res.json({ success: true, message: 'Branding saved', settings: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};