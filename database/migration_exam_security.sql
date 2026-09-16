-- ============================================
-- CareerMyntra Exam Portal - Exam Security
-- Adds:
--   1. candidate_sessions — one row per issued login token, so we can tell
--      a candidate is logged in from a second device (multi-login) and can
--      force-expire a token server-side (auto logout), which a plain
--      stateless JWT cannot do on its own.
--   2. ip_address / device_label on exam_attempts — so admin can see what
--      IP/device an exam was actually attempted from, per attempt.
-- ============================================

CREATE TABLE IF NOT EXISTS candidate_sessions (
  session_id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
  token_jti VARCHAR(64) NOT NULL UNIQUE,
  ip_address VARCHAR(64),
  user_agent TEXT,
  device_label VARCHAR(150),
  is_active BOOLEAN DEFAULT TRUE,
  login_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW(),
  logged_out_at TIMESTAMP,
  logged_out_reason VARCHAR(50) -- 'manual_logout' | 'new_login_elsewhere'
);

CREATE INDEX IF NOT EXISTS idx_candidate_sessions_candidate ON candidate_sessions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_sessions_jti ON candidate_sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_candidate_sessions_active ON candidate_sessions(candidate_id, is_active);

ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS device_label VARCHAR(150);