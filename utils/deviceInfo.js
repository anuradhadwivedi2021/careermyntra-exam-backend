/**
 * Small helpers for exam-security tracking (login sessions, exam attempts).
 * Deliberately dependency-free — a full UA-parser library is overkill for
 * an admin-facing "which device was this" label.
 */

// req.socket.remoteAddress is the raw TCP peer, which is the load
// balancer/proxy's IP when the app sits behind one (Render, Railway, nginx,
// etc). Those set X-Forwarded-For to "client, proxy1, proxy2..." — the
// first entry is the real client.
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function parseDeviceLabel(userAgent) {
  if (!userAgent) return 'Unknown device';

  let os = 'Unknown OS';
  if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/iphone/i.test(userAgent)) os = 'iPhone';
  else if (/ipad/i.test(userAgent)) os = 'iPad';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/mac os/i.test(userAgent)) os = 'Mac';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  let browser = 'Unknown browser';
  if (/edg\//i.test(userAgent)) browser = 'Edge';
  else if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) browser = 'Chrome';
  else if (/firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) browser = 'Safari';

  return `${browser} on ${os}`;
}

module.exports = { getClientIp, parseDeviceLabel };