const pool = require('../config/db');

// Admin: create coupon
exports.createCoupon = async (req, res) => {
  const { code, discount_type, discount_value, valid_from, valid_until, usage_limit } = req.body;
  const admin_id = req.admin.admin_id;

  if (!code || !discount_type || discount_value === undefined) {
    return res.status(400).json({ success: false, message: 'code, discount_type and discount_value are required' });
  }
  if (!['flat', 'percentage'].includes(discount_type)) {
    return res.status(400).json({ success: false, message: 'discount_type must be flat or percentage' });
  }

  try {
    const existing = await pool.query('SELECT coupon_id FROM coupons WHERE code = $1', [code.trim().toUpperCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A coupon with this code already exists' });
    }

    const result = await pool.query(
      `INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until, usage_limit, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        code.trim().toUpperCase(),
        discount_type,
        discount_value,
        valid_from || null,
        valid_until || null,
        usage_limit || null,
        admin_id,
      ]
    );
    res.status(201).json({ success: true, coupon: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: list all coupons
exports.listCoupons = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ success: true, coupons: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: update coupon (mainly used to toggle is_active)
exports.updateCoupon = async (req, res) => {
  const { coupon_id } = req.params;
  const { discount_type, discount_value, valid_from, valid_until, usage_limit, is_active } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM coupons WHERE coupon_id = $1', [coupon_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    const current = existing.rows[0];

    const result = await pool.query(
      `UPDATE coupons SET
        discount_type = $1, discount_value = $2, valid_from = $3, valid_until = $4,
        usage_limit = $5, is_active = $6, updated_at = NOW()
       WHERE coupon_id = $7 RETURNING *`,
      [
        discount_type ?? current.discount_type,
        discount_value === undefined ? current.discount_value : discount_value,
        valid_from === undefined ? current.valid_from : valid_from,
        valid_until === undefined ? current.valid_until : valid_until,
        usage_limit === undefined ? current.usage_limit : usage_limit,
        is_active === undefined ? current.is_active : is_active,
        coupon_id,
      ]
    );
    res.json({ success: true, coupon: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: delete coupon
exports.deleteCoupon = async (req, res) => {
  const { coupon_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM coupons WHERE coupon_id = $1 RETURNING coupon_id', [coupon_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};