-- ============================================
-- CareerMyntra Exam Portal - Terms Consent
-- ============================================
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;