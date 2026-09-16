const jwt = require('jsonwebtoken');
const pool = require('../config/db');

exports.verifyCandidate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tokens issued before the session-tracking feature shipped have no
    // jti — let those through as before rather than logging everyone out
    // on deploy. Tokens issued after login now always carry one, and are
    // checked against candidate_sessions so a session closed by a newer
    // login elsewhere (or by /logout) stops working immediately instead
    // of staying valid until it naturally expires.
    if (decoded.jti) {
      const session = await pool.query(
        'SELECT is_active, logged_out_reason FROM candidate_sessions WHERE token_jti = $1',
        [decoded.jti]
      );
      if (session.rows.length > 0 && !session.rows[0].is_active) {
        const reason = session.rows[0].logged_out_reason === 'new_login_elsewhere'
          ? 'You have been logged out because your account was signed in from another device.'
          : 'Your session has ended. Please log in again.';
        return res.status(401).json({ success: false, message: reason, session_ended: true });
      }
      // Fire-and-forget — a slow/failed heartbeat update should never block the request.
      pool.query('UPDATE candidate_sessions SET last_seen_at = NOW() WHERE token_jti = $1', [decoded.jti]).catch(() => {});
    }

    req.candidate = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

exports.verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin_id) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Same idea as verifyAdmin, but never blocks the request — used on public
// endpoints (like the gallery list) that show different data to a logged-in
// admin (everything) vs a normal visitor (published-only). No token, a
// malformed token, or an expired token all just fall through as "public".
exports.optionalAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.admin_id) {
        req.admin = decoded;
      }
    } catch (err) {
      // invalid/expired token on a public route — treat as a normal visitor
    }
  }
  next();
};

// Must run AFTER verifyAdmin. Only the super-admin role ('super' in admin_roles,
// is_system = TRUE) may pass — used to gate admin creation and any other
// action that should never be delegable to a lower role.
exports.requireSuperAdmin = (req, res, next) => {
  if (!req.admin || req.admin.role !== 'super') {
    return res.status(403).json({ success: false, message: 'Only a super admin can perform this action' });
  }
  next();
};