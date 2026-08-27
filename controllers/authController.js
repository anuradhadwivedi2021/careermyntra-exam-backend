const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============ REGISTER ============
exports.register = async (req, res) => {
  const { full_name, mobile_number, email, password } = req.body;

  if (!full_name || !mobile_number || !password) {
    return res.status(400).json({ success: false, message: 'Name, mobile and password are required' });
  }

  try {
    // Check if mobile already exists
    const existing = await pool.query(
      'SELECT candidate_id FROM candidates WHERE mobile_number = $1',
      [mobile_number]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Mobile number already registered' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = generateOTP();
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

    const result = await pool.query(
      `INSERT INTO candidates (full_name, mobile_number, email, password_hash, otp_code, otp_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING candidate_id, full_name, mobile_number, email`,
      [full_name, mobile_number, email, password_hash, otp, otp_expires_at]
    );

    // TODO: Replace with real SMS provider later
    console.log(`📱 OTP for ${mobile_number}: ${otp}`);

    res.status(201).json({
      success: true,
      message: 'Registered successfully. OTP sent for verification.',
      candidate: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ VERIFY OTP ============
exports.verifyOtp = async (req, res) => {
  const { mobile_number, otp } = req.body;

  if (!mobile_number || !otp) {
    return res.status(400).json({ success: false, message: 'Mobile number and OTP are required' });
  }

  try {
    const result = await pool.query(
      'SELECT candidate_id, otp_code, otp_expires_at, mobile_verified FROM candidates WHERE mobile_number = $1',
      [mobile_number]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const candidate = result.rows[0];

    if (candidate.mobile_verified) {
      return res.status(400).json({ success: false, message: 'Mobile already verified' });
    }

    if (candidate.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (new Date() > new Date(candidate.otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    await pool.query(
      'UPDATE candidates SET mobile_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE candidate_id = $1',
      [candidate.candidate_id]
    );

    res.json({ success: true, message: 'Mobile number verified successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ LOGIN ============
exports.login = async (req, res) => {
  const { mobile_number, password } = req.body;

  if (!mobile_number || !password) {
    return res.status(400).json({ success: false, message: 'Mobile number and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM candidates WHERE mobile_number = $1',
      [mobile_number]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const candidate = result.rows[0];

    if (!candidate.mobile_verified) {
      return res.status(403).json({ success: false, message: 'Please verify your mobile number first' });
    }

    const isMatch = await bcrypt.compare(password, candidate.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { candidate_id: candidate.candidate_id, mobile_number: candidate.mobile_number },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      candidate: {
        candidate_id: candidate.candidate_id,
        full_name: candidate.full_name,
        mobile_number: candidate.mobile_number,
        email: candidate.email
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.testRoute = (req, res) => {
  res.json({ message: 'Auth routes working fine!' });
};