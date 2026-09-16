-- ============================================
-- CareerMyntra Exam Portal - Contact Us Messages
-- ============================================
CREATE TABLE IF NOT EXISTS contact_messages (
  message_id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'new',  -- 'new' | 'read' | 'resolved'
  created_at TIMESTAMP DEFAULT NOW()
);