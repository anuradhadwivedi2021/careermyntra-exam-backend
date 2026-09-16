const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

exports.registerAdmin = async (req, res) => {
  const { full_name, email, password, role } = req.body;
  if (!full_name || !email || !password) {
    return res.status(400).json({ success: false, message: 'full_name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  // Default new admins to a non-super role so a super-admin has to
  // deliberately grant that level of access, not just leave it out.
  const role_id = role || 'exam';

  try {
    const roleCheck = await pool.query('SELECT role_id FROM admin_roles WHERE role_id = $1', [role_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: `Unknown role "${role_id}"` });
    }

    const existing = await pool.query('SELECT admin_id FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Admin with this email already exists' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO admins (full_name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING admin_id, full_name, email, role`,
      [full_name, email, password_hash, role_id]
    );
    res.status(201).json({ success: true, admin: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { admin_id: admin.admin_id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: { admin_id: admin.admin_id, full_name: admin.full_name, email: admin.email, role: admin.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};