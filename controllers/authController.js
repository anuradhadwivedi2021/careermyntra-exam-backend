const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendEmailOtp } = require('../services/emailservice');
const { sendSmsOtp } = require('../services/smsService');
const { getClientIp, parseDeviceLabel } = require('../utils/deviceInfo');

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============ REGISTER ============
exports.register = async (req, res) => {
  const { full_name, mobile_number, email, password, terms_accepted } = req.body;

  if (!full_name || !mobile_number || !password) {
    return res.status(400).json({ success: false, message: 'Name, mobile and password are required' });
  }

  if (terms_accepted !== true) {
    return res.status(400).json({ success: false, message: 'You must accept the Terms & Conditions and Privacy Policy' });
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

    // Check if email already exists (only when an email was given —
    // the column allows NULL/duplicate NULLs, so this only fires for real emails)
    if (email) {
      const existingEmail = await pool.query(
        'SELECT candidate_id FROM candidates WHERE email = $1',
        [email]
      );
      if (existingEmail.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Email is already registered' });
      }
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Generate mobile OTP
    const otp = generateOTP();
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

    // Generate email OTP too, if an email was provided
    const email_otp = email ? generateOTP() : null;
    const email_otp_expires_at = email ? new Date(Date.now() + 10 * 60 * 1000) : null;

    const result = await pool.query(
      `INSERT INTO candidates
         (full_name, mobile_number, email, password_hash, otp_code, otp_expires_at,
          email_otp, email_otp_expires_at, terms_accepted, terms_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW())
       RETURNING candidate_id, full_name, mobile_number, email`,
      [full_name, mobile_number, email, password_hash, otp, otp_expires_at, email_otp, email_otp_expires_at]
    );

    let mobileOtpSent = false;
    let mobileOtpError = null;
    try {
      await sendSmsOtp(mobile_number, otp, 'mobile_otp', result.rows[0].candidate_id);
      mobileOtpSent = true;
    } catch (smsErr) {
      // Don't fail the whole registration just because the SMS couldn't be
      // sent (e.g. Twilio not configured yet) — the account is still created
      // and the OTP can be resent once the provider is set up. Logging the
      // OTP here is a local-dev fallback only, never rely on this in prod.
      console.error('Mobile OTP send failed:', smsErr.message);
      console.log(`📱 [DEV FALLBACK] OTP for ${mobile_number}: ${otp}`);
      mobileOtpError = smsErr.message;
    }

    let emailOtpSent = false;
    let emailOtpError = null;
    if (email) {
      try {
        await sendEmailOtp(email, email_otp, 'email_otp', result.rows[0].candidate_id);
        emailOtpSent = true;
      } catch (emailErr) {
        // Don't fail the whole registration just because the email couldn't
        // be sent (e.g. SMTP not configured yet) — candidate can still
        // verify by mobile and retry email verification via /send-email-otp.
        console.error('Email OTP send failed:', emailErr.message);
        emailOtpError = emailErr.message;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Registered successfully. OTP sent for verification.',
      candidate: result.rows[0],
      mobile_otp_sent: mobileOtpSent,
      ...(mobileOtpError ? { mobile_otp_error: mobileOtpError } : {}),
      email_otp_sent: emailOtpSent,
      ...(emailOtpError ? { email_otp_error: emailOtpError } : {})
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

// ============ SEND / RESEND EMAIL OTP ============
exports.sendEmailOtpToCandidate = async (req, res) => {
  const { mobile_number } = req.body;

  if (!mobile_number) {
    return res.status(400).json({ success: false, message: 'Mobile number is required' });
  }

  try {
    const result = await pool.query(
      'SELECT candidate_id, email, email_verified FROM candidates WHERE mobile_number = $1',
      [mobile_number]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const candidate = result.rows[0];

    if (!candidate.email) {
      return res.status(400).json({ success: false, message: 'No email on file for this account' });
    }
    if (candidate.email_verified) {
      return res.status(400).json({ success: false, message: 'Email already verified' });
    }

    const email_otp = generateOTP();
    const email_otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'UPDATE candidates SET email_otp = $1, email_otp_expires_at = $2 WHERE candidate_id = $3',
      [email_otp, email_otp_expires_at, candidate.candidate_id]
    );

    await sendEmailOtp(candidate.email, email_otp, 'email_otp_resend', candidate.candidate_id);

    res.json({ success: true, message: 'OTP sent to your email address' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to send email OTP', error: err.message });
  }
};

// ============ VERIFY EMAIL OTP ============
exports.verifyEmailOtp = async (req, res) => {
  const { mobile_number, otp } = req.body;

  if (!mobile_number || !otp) {
    return res.status(400).json({ success: false, message: 'Mobile number and OTP are required' });
  }

  try {
    const result = await pool.query(
      'SELECT candidate_id, email_otp, email_otp_expires_at, email_verified FROM candidates WHERE mobile_number = $1',
      [mobile_number]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const candidate = result.rows[0];

    if (candidate.email_verified) {
      return res.status(400).json({ success: false, message: 'Email already verified' });
    }

    if (!candidate.email_otp || candidate.email_otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (!candidate.email_otp_expires_at || new Date() > new Date(candidate.email_otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    await pool.query(
      'UPDATE candidates SET email_verified = TRUE, email_otp = NULL, email_otp_expires_at = NULL WHERE candidate_id = $1',
      [candidate.candidate_id]
    );

    res.json({ success: true, message: 'Email verified successfully' });
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

    if (!candidate.is_active) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });
    }

    const isMatch = await bcrypt.compare(password, candidate.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { candidate_id: candidate.candidate_id, mobile_number: candidate.mobile_number, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Multi-login detection: if this candidate already has another active
    // session (didn't log out, token hasn't expired), flag and close it —
    // one active exam session per candidate at a time. The old device's
    // next request will get a clean "logged in elsewhere" error instead of
    // silently continuing to work, which is what makes this useful for
    // exam integrity rather than just a log entry no one reads.
    const ip_address = getClientIp(req);
    const device_label = parseDeviceLabel(req.headers['user-agent']);

    const previousActive = await pool.query(
      'SELECT session_id FROM candidate_sessions WHERE candidate_id = $1 AND is_active = true',
      [candidate.candidate_id]
    );
    const multipleLoginDetected = previousActive.rows.length > 0;

    if (multipleLoginDetected) {
      await pool.query(
        `UPDATE candidate_sessions SET is_active = false, logged_out_at = NOW(), logged_out_reason = 'new_login_elsewhere'
         WHERE candidate_id = $1 AND is_active = true`,
        [candidate.candidate_id]
      );
    }

    await pool.query(
      `INSERT INTO candidate_sessions (candidate_id, token_jti, ip_address, user_agent, device_label)
       VALUES ($1, $2, $3, $4, $5)`,
      [candidate.candidate_id, jti, ip_address, req.headers['user-agent'] || null, device_label]
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      multiple_login_detected: multipleLoginDetected,
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

// ============ FORGOT PASSWORD (request OTP) ============
exports.forgotPassword = async (req, res) => {
  const { mobile_number } = req.body;

  if (!mobile_number) {
    return res.status(400).json({ success: false, message: 'Mobile number is required' });
  }

  try {
    const result = await pool.query(
      'SELECT candidate_id FROM candidates WHERE mobile_number = $1',
      [mobile_number]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No account found with this mobile number' });
    }

    const otp = generateOTP();
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

    await pool.query(
      'UPDATE candidates SET otp_code = $1, otp_expires_at = $2 WHERE mobile_number = $3',
      [otp, otp_expires_at, mobile_number]
    );

    // Unlike register(), this endpoint's entire purpose is delivering the
    // OTP — if the SMS genuinely fails to send, the candidate has no other
    // way to get it, so this must surface as an error rather than silently
    // succeeding.
    try {
      await sendSmsOtp(mobile_number, otp, 'password_reset_otp', result.rows[0].candidate_id);
    } catch (smsErr) {
      console.error('Password reset OTP send failed:', smsErr.message);
      console.log(`🔑 [DEV FALLBACK] Password reset OTP for ${mobile_number}: ${otp}`);
      return res.status(502).json({
        success: false,
        message: 'Could not send OTP to your mobile number. Please try again shortly.',
        error: smsErr.message
      });
    }

    res.json({ success: true, message: 'OTP sent to your mobile number' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ RESET PASSWORD (verify OTP + set new password) ============
exports.resetPassword = async (req, res) => {
  const { mobile_number, otp, new_password } = req.body;

  if (!mobile_number || !otp || !new_password) {
    return res.status(400).json({ success: false, message: 'Mobile number, OTP and new password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  try {
    const result = await pool.query(
      'SELECT candidate_id, otp_code, otp_expires_at FROM candidates WHERE mobile_number = $1',
      [mobile_number]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const candidate = result.rows[0];

    if (!candidate.otp_code || candidate.otp_code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    if (!candidate.otp_expires_at || new Date() > new Date(candidate.otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE candidates SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL WHERE candidate_id = $2',
      [password_hash, candidate.candidate_id]
    );

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ GET PROFILE ============
exports.getProfile = async (req, res) => {
  const candidate_id = req.candidate.candidate_id;
  try {
    const result = await pool.query(
      `SELECT candidate_id, full_name, mobile_number, email, mobile_verified, email_verified, created_at,
              date_of_birth, gender, qualification, profile_photo_url
       FROM candidates WHERE candidate_id = $1`,
      [candidate_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    res.json({ success: true, candidate: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ UPDATE PROFILE ============
// Mobile number is intentionally not editable here — it's the login identity
// and is tied to OTP verification.
const VALID_GENDERS = ['male', 'female', 'other'];
const VALID_QUALIFICATIONS = ['10th', '12th', 'diploma', 'graduate', 'postgraduate'];

exports.updateProfile = async (req, res) => {
  const candidate_id = req.candidate.candidate_id;
  const { full_name, email, date_of_birth, gender, qualification, profile_photo_url } = req.body;

  if (!full_name) {
    return res.status(400).json({ success: false, message: 'full_name is required' });
  }
  if (gender && !VALID_GENDERS.includes(gender)) {
    return res.status(400).json({ success: false, message: 'Invalid gender value' });
  }
  if (qualification && !VALID_QUALIFICATIONS.includes(qualification)) {
    return res.status(400).json({ success: false, message: 'Invalid qualification value' });
  }
  if (date_of_birth && Number.isNaN(new Date(date_of_birth).getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid date_of_birth' });
  }

  try {
    // If the email is actually changing, drop the old verification status —
    // a verified flag must not silently carry over to a different address.
    const current = await pool.query('SELECT email FROM candidates WHERE candidate_id = $1', [candidate_id]);
    const emailChanged = current.rows.length > 0 && (current.rows[0].email || null) !== (email || null);

    const result = await pool.query(
      `UPDATE candidates
       SET full_name = $1, email = $2, date_of_birth = $3, gender = $4, qualification = $5,
           profile_photo_url = COALESCE($8, profile_photo_url),
           email_verified = CASE WHEN $7 THEN FALSE ELSE email_verified END,
           updated_at = NOW()
       WHERE candidate_id = $6
       RETURNING candidate_id, full_name, mobile_number, email, mobile_verified, email_verified, date_of_birth, gender, qualification, profile_photo_url`,
      [full_name, email || null, date_of_birth || null, gender || null, qualification || null, candidate_id, emailChanged, profile_photo_url || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    res.json({ success: true, message: 'Profile updated', candidate: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ============ LOGOUT ============
// Marks this token's session inactive server-side. Without this, a
// stateless JWT stays valid until it naturally expires even after the
// candidate clicks "Logout" — this makes logout actually end the session,
// and shows up correctly in the login-activity list instead of looking
// like an abandoned session.
exports.logout = async (req, res) => {
  const jti = req.candidate?.jti;
  if (!jti) {
    // Older token issued before this feature shipped — nothing to mark inactive.
    return res.json({ success: true, message: 'Logged out' });
  }
  try {
    await pool.query(
      `UPDATE candidate_sessions SET is_active = false, logged_out_at = NOW(), logged_out_reason = 'manual_logout'
       WHERE token_jti = $1`,
      [jti]
    );
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};