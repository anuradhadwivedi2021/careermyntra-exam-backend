const pool = require('../config/db');

// Public: active plans only, in sort order
exports.getPublicPlans = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pricing_plans WHERE is_active = TRUE ORDER BY sort_order ASC, plan_id ASC'
    );
    res.json({ success: true, plans: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: all plans (including inactive)
exports.getAllPlans = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pricing_plans ORDER BY sort_order ASC, plan_id ASC');
    res.json({ success: true, plans: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: create plan
exports.createPlan = async (req, res) => {
  const { name, price, blurb, features, highlighted, sort_order } = req.body;
  if (!name || !price) {
    return res.status(400).json({ success: false, message: 'name and price are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO pricing_plans (name, price, blurb, features, highlighted, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, price, blurb || '', JSON.stringify(features || []), !!highlighted, sort_order || 0]
    );
    res.status(201).json({ success: true, plan: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: update plan
exports.updatePlan = async (req, res) => {
  const { plan_id } = req.params;
  try {
    const existing = await pool.query('SELECT * FROM pricing_plans WHERE plan_id = $1', [plan_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    const c = existing.rows[0];
    const { name, price, blurb, features, highlighted, sort_order, is_active } = req.body;

    const result = await pool.query(
      `UPDATE pricing_plans SET
        name = $1, price = $2, blurb = $3, features = $4,
        highlighted = $5, sort_order = $6, is_active = $7, updated_at = NOW()
       WHERE plan_id = $8 RETURNING *`,
      [
        name ?? c.name,
        price ?? c.price,
        blurb === undefined ? c.blurb : blurb,
        features === undefined ? c.features : JSON.stringify(features),
        highlighted === undefined ? c.highlighted : highlighted,
        sort_order === undefined ? c.sort_order : sort_order,
        is_active === undefined ? c.is_active : is_active,
        plan_id,
      ]
    );
    res.json({ success: true, plan: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin: delete plan
exports.deletePlan = async (req, res) => {
  const { plan_id } = req.params;
  try {
    const result = await pool.query('DELETE FROM pricing_plans WHERE plan_id = $1 RETURNING plan_id', [plan_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }
    res.json({ success: true, message: 'Plan deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};