const nodemailer = require('nodemailer');
const pool = require('../config/db');

// Reuses one transporter across calls instead of creating a new SMTP
// connection on every email — cheaper and avoids connection-pool exhaustion.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587/25
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return transporter;
}

/**
 * Writes one row to email_logs. Never throws — a logging failure should
 * never be the reason an email send appears to fail to the caller.
 */
async function logEmail({ email, purpose, status, providerMessageId, errorMessage, candidateId }) {
  try {
    await pool.query(
      `INSERT INTO email_logs (recipient_email, purpose, status, provider_message_id, error_message, candidate_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [email, purpose, status, providerMessageId || null, errorMessage || null, candidateId || null]
    );
  } catch (logErr) {
    console.error('Failed to write email_logs entry:', logErr.message);
  }
}

/**
 * Sends the email-verification OTP to a candidate.
 * Throws if SMTP is not configured or the send fails — callers should
 * catch this and decide how to respond (see authController). Every
 * attempt, successful or not, is recorded in email_logs.
 *
 * `purpose` and `candidateId` are optional and only affect the log entry —
 * pass them from callers where available so the admin log view is easy
 * to filter.
 */
async function sendEmailOtp(toEmail, otp, purpose = 'email_otp', candidateId = null) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    const err = new Error('SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD missing in .env)');
    await logEmail({ email: toEmail, purpose, status: 'failed', errorMessage: err.message, candidateId });
    throw err;
  }

  const mailer = getTransporter();

  try {
    const info = await mailer.sendMail({
      from: process.env.SMTP_FROM || `"CareerMyntra" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: 'Verify your email — CareerMyntra',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#1a56db;">CareerMyntra</h2>
          <p>Use the OTP below to verify your email address:</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
          <p>This OTP is valid for 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });
    await logEmail({ email: toEmail, purpose, status: 'sent', providerMessageId: info.messageId, candidateId });
  } catch (sendErr) {
    await logEmail({ email: toEmail, purpose, status: 'failed', errorMessage: sendErr.message, candidateId });
    throw sendErr;
  }
}

module.exports = { sendEmailOtp };