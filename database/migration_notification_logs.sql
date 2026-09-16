-- ============================================
-- CareerMyntra Exam Portal - Notification logs
-- Tracks every SMS and email the platform attempts to send (OTPs today;
-- exam reminders / result / payment notifications can log to the same
-- tables once those triggers are added later) so support/admin can see
-- what was sent, to whom, and whether it succeeded — without grepping
-- server logs.
-- ============================================

CREATE TABLE IF NOT EXISTS sms_logs (
  log_id SERIAL PRIMARY KEY,
  recipient_mobile VARCHAR(20) NOT NULL,
  purpose VARCHAR(50) NOT NULL,           -- e.g. 'mobile_otp', 'password_reset_otp'
  status VARCHAR(20) NOT NULL,            -- 'sent' | 'failed'
  provider_message_id VARCHAR(100),       -- Twilio SID, when sent
  error_message TEXT,                     -- populated when status = 'failed'
  candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  log_id SERIAL PRIMARY KEY,
  recipient_email VARCHAR(150) NOT NULL,
  purpose VARCHAR(50) NOT NULL,           -- e.g. 'email_otp'
  status VARCHAR(20) NOT NULL,            -- 'sent' | 'failed'
  provider_message_id VARCHAR(150),       -- SMTP message-id, when sent
  error_message TEXT,                     -- populated when status = 'failed'
  candidate_id INTEGER REFERENCES candidates(candidate_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);