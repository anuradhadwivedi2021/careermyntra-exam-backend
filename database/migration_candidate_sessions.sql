CREATE TABLE IF NOT EXISTS candidate_sessions (
  session_id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(candidate_id),
  device_info TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);