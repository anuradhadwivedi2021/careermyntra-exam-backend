const twilio = require('twilio');
const pool = require('../config/db');

// Reuses one client across calls instead of creating a new Twilio client
// on every OTP — cheaper and avoids re-doing auth on every send.
let client = null;

function getClient() {
  if (client) return client;

  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

/**
 * Writes one row to sms_logs. Never throws — a logging failure should
 * never be the reason an OTP send appears to fail to the caller.
 */
async function logSms({ mobile, purpose, status, providerMessageId, errorMessage, candidateId }) {
  try {
    await pool.query(
      `INSERT INTO sms_logs (recipient_mobile, purpose, status, provider_message_id, error_message, candidate_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [mobile, purpose, status, providerMessageId || null, errorMessage || null, candidateId || null]
    );
  } catch (logErr) {
    console.error('Failed to write sms_logs entry:', logErr.message);
  }
}

/**
 * Sends the mobile-verification / password-reset OTP to a candidate via SMS.
 * Throws if Twilio is not configured or the send fails — callers should
 * catch this and decide how to respond (see authController). Every attempt,
 * successful or not, is recorded in sms_logs.
 *
 * mobile_number is stored without a country code in the DB, so it is
 * prefixed with TWILIO_DEFAULT_COUNTRY_CODE (defaults to India, +91)
 * unless it already starts with "+".
 *
 * `purpose` and `candidateId` are optional and only affect the log entry
 * (e.g. 'mobile_otp' vs 'password_reset_otp') — pass them from callers
 * where available so the admin log view is easy to filter.
 */
async function sendSmsOtp(mobileNumber, otp, purpose = 'mobile_otp', candidateId = null) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    const err = new Error('SMS provider is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER missing in .env)');
    await logSms({ mobile: mobileNumber, purpose, status: 'failed', errorMessage: err.message, candidateId });
    throw err;
  }

  const countryCode = process.env.TWILIO_DEFAULT_COUNTRY_CODE || '+91';
  const toNumber = mobileNumber.startsWith('+') ? mobileNumber : `${countryCode}${mobileNumber}`;

  const twilioClient = getClient();

  try {
    const message = await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: toNumber,
      body: `CareerMyntra OTP: ${otp}. Valid for 10 minutes. Do not share this with anyone.`,
    });
    await logSms({ mobile: mobileNumber, purpose, status: 'sent', providerMessageId: message.sid, candidateId });
  } catch (sendErr) {
    await logSms({ mobile: mobileNumber, purpose, status: 'failed', errorMessage: sendErr.message, candidateId });
    throw sendErr;
  }
}

module.exports = { sendSmsOtp };