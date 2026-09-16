-- ============================================
-- CareerMyntra Exam Portal - Email Verification
-- ============================================
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_otp VARCHAR(6),
  ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMP;